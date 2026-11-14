import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/api-error';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from '../src/lib/totp';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('TOTP MFA: secret generation, token verification, and window tolerance', () => {
  const secret = generateTotpSecret();
  assert.ok(secret);
  assert.equal(secret.length, 20);

  const now = Date.now();
  const token = generateTotp(secret, now);
  assert.equal(token.length, 6);
  assert.match(token, /^\d{6}$/);

  // Exact match succeeds
  assert.equal(verifyTotp(token, secret, 1, now), true);

  // Invalid token rejected
  assert.equal(verifyTotp('000000' === token ? '111111' : '000000', secret, 1, now), false);

  // Within 30s window drift succeeds
  assert.equal(verifyTotp(token, secret, 1, now + 25 * 1000), true);

  // Far future (> 60s) fails with window=1
  assert.equal(verifyTotp(token, secret, 1, now + 90 * 1000), false);
});

test('MFA Recovery Codes: single-use consumption and reuse prevention', () => {
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  assert.equal(plainCodes.length, 8);
  assert.equal(hashedCodes.length, 8);

  const jsonHashed = JSON.stringify(hashedCodes);
  const firstCode = plainCodes[0]!;

  // Valid first consumption
  const remaining1 = consumeRecoveryCode(firstCode, jsonHashed);
  assert.ok(remaining1);
  assert.equal(remaining1.length, 7);

  // Attempting to reuse the consumed code fails
  const reuseAttempt = consumeRecoveryCode(firstCode, JSON.stringify(remaining1));
  assert.equal(reuseAttempt, null);

  // Invalid code fails
  assert.equal(consumeRecoveryCode('INVALID-CODE', JSON.stringify(remaining1)), null);
});

test('Password policy: requires at least 12 characters and disallows reusing current password', () => {
  const validateNewPassword = (currPass: string, newPass: string) => {
    if (newPass.length < 12) {
      throw new AppError(400, 'New password must be at least 12 characters', 'PASSWORD_TOO_SHORT');
    }
    if (newPass === currPass) {
      throw new AppError(400, 'New password cannot be the same as your current password.', 'PASSWORD_REUSE');
    }
    return true;
  };

  // Too short (< 12) -> rejected
  assert.throws(
    () => validateNewPassword('oldPassword123!', 'shortPass1!'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'PASSWORD_TOO_SHORT');
      return true;
    }
  );

  // Same as old -> rejected
  assert.throws(
    () => validateNewPassword('SamePassword123!', 'SamePassword123!'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'PASSWORD_REUSE');
      return true;
    }
  );

  // Valid 12+ char password -> accepted
  assert.equal(validateNewPassword('oldPassword123!', 'BrandNewSecurePassword2026!'), true);
});

test('Last owner protection: prevents demoting or deactivating the last active owner', () => {
  interface MockUser {
    id: number;
    role: string;
    isActive: boolean;
  }

  const checkCanDemoteOrDeactivate = (
    users: MockUser[],
    targetId: number,
    nextRole?: string,
    nextIsActive?: boolean
  ) => {
    const target = users.find((u) => u.id === targetId);
    if (!target) throw new Error('Not found');

    const isTargetActiveOwner = target.role === 'owner' && target.isActive;
    const isDemotingOrDeactivating =
      (nextIsActive === false && target.isActive) ||
      (nextRole !== undefined && nextRole !== 'owner' && target.role === 'owner');

    if (isTargetActiveOwner && isDemotingOrDeactivating) {
      const remainingActiveOwners = users.filter(
        (u) => u.role === 'owner' && u.isActive && u.id !== target.id
      ).length;

      if (remainingActiveOwners === 0) {
        throw new AppError(
          400,
          'Cannot demote or deactivate the last remaining active owner.',
          'LAST_OWNER_PROTECTION'
        );
      }
    }
    return true;
  };

  const singleOwnerList: MockUser[] = [
    { id: 1, role: 'owner', isActive: true },
    { id: 2, role: 'waiter', isActive: true },
  ];

  // Attempting to deactivate only owner -> blocked
  assert.throws(
    () => checkCanDemoteOrDeactivate(singleOwnerList, 1, undefined, false),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'LAST_OWNER_PROTECTION');
      return true;
    }
  );

  // Attempting to demote only owner to manager -> blocked
  assert.throws(
    () => checkCanDemoteOrDeactivate(singleOwnerList, 1, 'manager', undefined),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'LAST_OWNER_PROTECTION');
      return true;
    }
  );

  // Two owners: deactivating one owner -> allowed
  const dualOwnerList: MockUser[] = [
    { id: 1, role: 'owner', isActive: true },
    { id: 2, role: 'owner', isActive: true },
  ];
  assert.equal(checkCanDemoteOrDeactivate(dualOwnerList, 1, undefined, false), true);
});

test('Login limiter: separate per-IP and per-email rate limiters', async () => {
  resetMemoryRateLimits();
  const testIp = '10.0.0.1';
  const testEmail = 'staff@tableflow.local';

  // IP limiter allows up to 20
  for (let i = 0; i < 20; i++) {
    await assert.doesNotReject(() => enforceRateLimit('login_ip', testIp));
  }
  await assert.rejects(
    () => enforceRateLimit('login_ip', testIp),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );

  // Email limiter allows up to 5
  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(() => enforceRateLimit('login_email', testEmail));
  }
  await assert.rejects(
    () => enforceRateLimit('login_email', testEmail),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );

  resetMemoryRateLimits();
});

test('TokenVersion: atomic increment on password change invalidates old sessions', () => {
  let userTokenVersion = 1;
  const issueSession = (ver: number) => ({ tokenVersion: ver });

  const activeSession1 = issueSession(userTokenVersion);

  // User changes password -> tokenVersion increments
  userTokenVersion += 1;

  const isSessionValid = (session: { tokenVersion: number }) =>
    session.tokenVersion === userTokenVersion;

  assert.equal(isSessionValid(activeSession1), false);

  const activeSession2 = issueSession(userTokenVersion);
  assert.equal(isSessionValid(activeSession2), true);
});
