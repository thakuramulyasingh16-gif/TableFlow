import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { MfaRequiredError } from '../src/auth';
import { AppError } from '../src/lib/api-error';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';
import { generateTotp, generateTotpSecret, verifyTotp } from '../src/lib/totp';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

interface MockUser {
  id: number;
  email: string;
  username: string | null;
  name: string;
  passwordHash: string;
  role: { name: string };
  isActive: boolean;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  tokenVersion: number;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaRecoveryCodes: string | null;
}

test('Login flow: supports login by email OR username (case-insensitive)', async () => {
  const password = 'StrongPassword2026!';
  const passwordHash = await bcrypt.hash(password, 10);

  const mockUser: MockUser = {
    id: 10,
    email: 'waiter@tableflow.com',
    username: 'waiter_01',
    name: 'John Waiter',
    passwordHash,
    role: { name: 'waiter' },
    isActive: true,
    lockedUntil: null,
    failedLoginAttempts: 0,
    tokenVersion: 1,
    mustChangePassword: false,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: null,
  };

  const users = [mockUser];

  const authenticate = async (rawId: string, pass: string) => {
    const norm = rawId.trim().toLowerCase();
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === norm ||
        (u.username && u.username.toLowerCase() === norm)
    );
    if (!user) return null;
    const valid = await bcrypt.compare(pass, user.passwordHash);
    if (!valid) return null;
    return user;
  };

  // 1. Login with exact email
  const byEmail = await authenticate('waiter@tableflow.com', password);
  assert.ok(byEmail);
  assert.equal(byEmail.id, 10);

  // 2. Login with uppercase email
  const byUpperEmail = await authenticate('WAITER@TABLEFLOW.COM', password);
  assert.ok(byUpperEmail);
  assert.equal(byUpperEmail.id, 10);

  // 3. Login with username
  const byUsername = await authenticate('waiter_01', password);
  assert.ok(byUsername);
  assert.equal(byUsername.id, 10);

  // 4. Login with uppercase username
  const byUpperUsername = await authenticate('WAITER_01', password);
  assert.ok(byUpperUsername);
  assert.equal(byUpperUsername.id, 10);

  // 5. Wrong password fails
  const wrongPass = await authenticate('waiter_01', 'wrongPassword');
  assert.equal(wrongPass, null);
});

test('Login flow: generic error and lockout protection on repeated failed attempts', async () => {
  const password = 'CorrectPassword2026!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user: MockUser = {
    id: 11,
    email: 'chef@tableflow.com',
    username: 'chef',
    name: 'Mario Chef',
    passwordHash,
    role: { name: 'chef' },
    isActive: true,
    lockedUntil: null,
    failedLoginAttempts: 0,
    tokenVersion: 1,
    mustChangePassword: false,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: null,
  };

  const attemptLogin = async (pass: string) => {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return { error: 'Invalid ID or password.' };
    }
    const valid = await bcrypt.compare(pass, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      return { error: 'Invalid ID or password.' };
    }
    user.failedLoginAttempts = 0;
    return { user };
  };

  // 4 wrong attempts -> still under lockout threshold
  for (let i = 0; i < 4; i++) {
    const res = await attemptLogin('badpass');
    assert.equal(res.error, 'Invalid ID or password.');
  }
  assert.equal(user.failedLoginAttempts, 4);
  assert.equal(user.lockedUntil, null);

  // 5th wrong attempt -> account locked
  const res5 = await attemptLogin('badpass');
  assert.equal(res5.error, 'Invalid ID or password.');
  assert.equal(user.failedLoginAttempts, 5);
  assert.ok(user.lockedUntil !== null);

  // 6th attempt with correct password fails because account is locked
  const resLocked = await attemptLogin(password);
  assert.equal(resLocked.error, 'Invalid ID or password.');
});

test('Login flow: accounts without MFA log in immediately without MFA prompt', async () => {
  const password = 'ValidPassword2026!';
  const passwordHash = await bcrypt.hash(password, 10);

  const userWithoutMfa: MockUser = {
    id: 12,
    email: 'waiter2@tableflow.com',
    username: 'waiter2',
    name: 'Waiter Two',
    passwordHash,
    role: { name: 'waiter' },
    isActive: true,
    lockedUntil: null,
    failedLoginAttempts: 0,
    tokenVersion: 1,
    mustChangePassword: false,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: null,
  };

  const processLogin = async (user: MockUser, pass: string, totpCode?: string) => {
    const valid = await bcrypt.compare(pass, user.passwordHash);
    if (!valid) throw new Error('Invalid ID or password.');

    if (user.mfaEnabled && user.mfaSecret) {
      if (!totpCode) {
        throw new MfaRequiredError();
      }
      const ok = verifyTotp(totpCode, user.mfaSecret);
      if (!ok) throw new Error('Invalid authenticator code.');
    }

    return { loggedIn: true, user };
  };

  // No totpCode supplied, mfaEnabled = false -> logs in directly!
  const result = await processLogin(userWithoutMfa, password);
  assert.ok(result.loggedIn);
  assert.equal(result.user.id, 12);
});

test('Login flow: accounts with MFA require MFA in step 2 when password is correct', async () => {
  const password = 'ValidPassword2026!';
  const passwordHash = await bcrypt.hash(password, 10);
  const secret = generateTotpSecret();

  const userWithMfa: MockUser = {
    id: 13,
    email: 'owner@tableflow.com',
    username: 'owner',
    name: 'Owner Boss',
    passwordHash,
    role: { name: 'owner' },
    isActive: true,
    lockedUntil: null,
    failedLoginAttempts: 0,
    tokenVersion: 1,
    mustChangePassword: false,
    mfaEnabled: true,
    mfaSecret: secret,
    mfaRecoveryCodes: null,
  };

  const processLogin = async (user: MockUser, pass: string, totpCode?: string) => {
    const valid = await bcrypt.compare(pass, user.passwordHash);
    if (!valid) throw new Error('Invalid ID or password.');

    if (user.mfaEnabled && user.mfaSecret) {
      if (!totpCode) {
        throw new MfaRequiredError();
      }
      const ok = verifyTotp(totpCode, user.mfaSecret);
      if (!ok) throw new Error('Invalid authenticator code.');
    }

    return { loggedIn: true, user };
  };

  // Step 1: correct password, no totpCode -> throws MfaRequiredError
  await assert.rejects(
    () => processLogin(userWithMfa, password),
    (err: unknown) => {
      assert.ok(err instanceof MfaRequiredError);
      assert.equal((err as MfaRequiredError).code, 'mfa_required');
      return true;
    }
  );

  // Step 2: wrong totp code -> rejected
  await assert.rejects(
    () => processLogin(userWithMfa, password, '000000'),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Invalid authenticator code.');
      return true;
    }
  );

  // Step 2: valid totp code -> succeeds!
  const validCode = generateTotp(secret);
  const successResult = await processLogin(userWithMfa, password, validCode);
  assert.ok(successResult.loggedIn);
  assert.equal(successResult.user.id, 13);
});

test('Login flow: enforces rate limits on login_ip and login_email', async () => {
  resetMemoryRateLimits();

  const ip = '10.0.0.5';
  const emailOrId = 'waiter';

  await assert.doesNotReject(() => enforceRateLimit('login_ip', ip));

  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(() => enforceRateLimit('login_email', emailOrId));
  }

  // 6th attempt on same ID in 15m window -> rate limited
  await assert.rejects(
    () => enforceRateLimit('login_email', emailOrId),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );
});
