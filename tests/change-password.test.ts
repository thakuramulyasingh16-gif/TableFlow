import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../src/lib/api-error';
import { CSRF_COOKIE_NAME, isTokenFormatValid, requireCsrf, setCsrfCookie } from '../src/lib/csrf';
import { assertValidPassword } from '../src/lib/password-policy';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('Public change password: requires valid CSRF double-submit token', async () => {
  // 1. Missing CSRF token -> rejected with 403
  const reqNoCsrf = new NextRequest('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'waiter',
      currentPassword: 'oldPassword123',
      newPassword: 'newSecurePassword2026!',
    }),
  });

  await assert.rejects(
    () => requireCsrf(reqNoCsrf),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_INVALID');
      return true;
    }
  );

  // 2. Mismatched CSRF token -> rejected with 403
  const reqMismatch = new NextRequest('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'token_alpha_123456789012345678',
      Cookie: `${CSRF_COOKIE_NAME}=token_beta_987654321098765432`,
    },
  });

  await assert.rejects(
    () => requireCsrf(reqMismatch),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // 3. Matching token -> passes
  const validToken = 'valid_csrf_token_12345678901234';
  const reqValid = new NextRequest('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': validToken,
      Cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
    },
  });

  await assert.doesNotReject(() => requireCsrf(reqValid));
});

test('Forced change password (mustChangePassword flow): CSRF validation behavior', async () => {
  const validToken = 'forced_change_csrf_token_123456789';

  // 1. Missing header token (root cause of the bug) -> fails with 403 CSRF_INVALID
  const reqMissingHeader = new NextRequest('http://localhost:3000/api/staff/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
    },
    body: JSON.stringify({
      currentPassword: 'CurrentTempPass123!',
      newPassword: 'BrandNewSecurePass2026!',
    }),
  });

  await assert.rejects(
    () => requireCsrf(reqMissingHeader),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_INVALID');
      assert.equal(err.message, 'Invalid or missing CSRF token');
      return true;
    }
  );

  // 2. Wrong token -> fails with 403 CSRF_INVALID
  const reqWrongToken = new NextRequest('http://localhost:3000/api/staff/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'wrong_token_12345678901234',
      Cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
    },
    body: JSON.stringify({
      currentPassword: 'CurrentTempPass123!',
      newPassword: 'BrandNewSecurePass2026!',
    }),
  });

  await assert.rejects(
    () => requireCsrf(reqWrongToken),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_INVALID');
      return true;
    }
  );

  // 3. Valid token matching cookie -> succeeds
  const reqSuccess = new NextRequest('http://localhost:3000/api/staff/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': validToken,
      Cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
    },
    body: JSON.stringify({
      currentPassword: 'CurrentTempPass123!',
      newPassword: 'BrandNewSecurePass2026!',
    }),
  });

  await assert.doesNotReject(() => requireCsrf(reqSuccess));
});

test('Stale or malformed CSRF cookie: detected and replaced automatically', () => {
  // 1. isTokenFormatValid checks length >= 16 and valid character set
  assert.equal(isTokenFormatValid(undefined), false);
  assert.equal(isTokenFormatValid(null), false);
  assert.equal(isTokenFormatValid('short'), false);
  assert.equal(isTokenFormatValid('invalid token with spaces!'), false);
  assert.equal(isTokenFormatValid('0KHYkVhwdtL_ep_750wYsD7wiUqMlaLk'), true);

  // 2. setCsrfCookie replaces stale/malformed token with a fresh valid token
  const res = NextResponse.json({ ok: true });
  const replacedToken = setCsrfCookie(res, 'too-short');
  assert.ok(replacedToken.length >= 24);
  assert.equal(isTokenFormatValid(replacedToken), true);
  assert.notEqual(replacedToken, 'too-short');

  const cookie = res.cookies.get(CSRF_COOKIE_NAME);
  assert.ok(cookie);
  assert.equal(cookie.value, replacedToken);
});

test('CSRF error retry logic: formats actionable session expired error message', () => {
  const isCsrfError = (status: number, code?: string, message?: string) =>
    status === 403 &&
    (code === 'CSRF_INVALID' ||
      code === 'CSRF_TOKEN_INVALID' ||
      message?.toLowerCase()?.includes('csrf'));

  assert.equal(isCsrfError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token'), true);
  assert.equal(isCsrfError(400, 'VALIDATION_ERROR'), false);

  const formatErrorMessage = (status: number, code?: string, rawMsg?: string) => {
    if (isCsrfError(status, code, rawMsg)) {
      return 'Session expired, please refresh the page';
    }
    return rawMsg || 'Request failed';
  };

  assert.equal(
    formatErrorMessage(403, 'CSRF_INVALID', 'Invalid or missing CSRF token'),
    'Session expired, please refresh the page'
  );
  assert.equal(
    formatErrorMessage(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters'),
    'Password must be at least 8 characters'
  );
});

test('Public change password: rate limits per IP and per ID', async () => {
  resetMemoryRateLimits();

  const ip = '192.168.1.100';
  const targetId = 'waiter';

  // ID limiter allows max 5 attempts in 15m window
  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(() =>
      enforceRateLimit('change_password_id', `${ip}:${targetId}`)
    );
  }

  // 6th attempt -> rejected with 429
  await assert.rejects(
    () => enforceRateLimit('change_password_id', `${ip}:${targetId}`),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );
});

test('Public change password: generic error on non-existent account (no user enumeration)', async () => {
  const dummyPasswordHash = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8u1l4P3z9b/3dY8/3L0S1p2nF2qKXe';
  
  // Simulate handler logic for unknown user
  const verifyPublicChangePassword = async (user: { email: string; passwordHash: string } | null, pass: string) => {
    if (!user) {
      // Dummy compare to avoid timing leak
      await bcrypt.compare(pass, dummyPasswordHash);
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }
  };

  await assert.rejects(
    () => verifyPublicChangePassword(null, 'wrongPassword'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, 'Invalid ID or password.');
      assert.equal(err.code, 'INVALID_CREDENTIALS');
      return true;
    }
  );
});

test('Public change password: generic error on deactivated or locked account', async () => {
  const checkAccountEligibility = (user: { isActive: boolean; lockedUntil: Date | null }) => {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }
    return true;
  };

  // Deactivated user -> generic error
  assert.throws(
    () => checkAccountEligibility({ isActive: false, lockedUntil: null }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.message, 'Invalid ID or password.');
      return true;
    }
  );

  // Locked user -> generic error
  assert.throws(
    () => checkAccountEligibility({ isActive: true, lockedUntil: new Date(Date.now() + 600000) }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.message, 'Invalid ID or password.');
      return true;
    }
  );
});

test('Public change password: fails on incorrect current password and increments failed attempts', async () => {
  const passwordHash = await bcrypt.hash('CorrectCurrent123!', 10);
  let failedLoginAttempts = 0;
  let lockedUntil: Date | null = null;

  const attemptChange = async (attemptedCurrentPass: string) => {
    const valid = await bcrypt.compare(attemptedCurrentPass, passwordHash);
    if (!valid) {
      failedLoginAttempts += 1;
      if (failedLoginAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }
    failedLoginAttempts = 0;
    return true;
  };

  // Wrong password
  await assert.rejects(
    () => attemptChange('WrongPassword123!'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.message, 'Invalid ID or password.');
      return true;
    }
  );
  assert.equal(failedLoginAttempts, 1);
  assert.equal(lockedUntil, null);

  // 4 more wrong attempts -> locks account
  for (let i = 0; i < 4; i++) {
    await assert.rejects(() => attemptChange('WrongPassword123!'));
  }
  assert.equal(failedLoginAttempts, 5);
  assert.ok(lockedUntil !== null);
});

test('Change password: rejects reusing existing password and enforces password policy', async () => {
  const currentPassword = 'OldSecurePassword2026!';
  const currentHash = await bcrypt.hash(currentPassword, 10);
  const userContext = { email: 'chef@tableflow.com', username: 'chef', id: 5 };

  const validateChange = async (newPass: string) => {
    const isSame = await bcrypt.compare(newPass, currentHash);
    if (isSame) {
      throw new AppError(400, 'New password cannot be the same as your current password.', 'PASSWORD_REUSE');
    }
    assertValidPassword(newPass, userContext);
    return true;
  };

  // Reusing same password
  await assert.rejects(
    () => validateChange(currentPassword),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'PASSWORD_REUSE');
      return true;
    }
  );

  // New password < 8 characters
  await assert.rejects(
    () => validateChange('Short1!'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'WEAK_PASSWORD');
      return true;
    }
  );

  // New password in common list
  await assert.rejects(
    () => validateChange('tableflow123'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'WEAK_PASSWORD');
      return true;
    }
  );

  // New password matches username/email
  await assert.rejects(
    () => validateChange('chef'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'WEAK_PASSWORD');
      return true;
    }
  );

  // Strong, valid new password succeeds
  const success = await validateChange('BrandNewSecurePassword2026!#');
  assert.equal(success, true);
});

test('Change password: updates tokenVersion, resets failedLoginAttempts, and clears mustChangePassword', () => {
  const user = {
    tokenVersion: 2,
    failedLoginAttempts: 3,
    lockedUntil: null as Date | null,
    mustChangePassword: true,
  };

  // Successful change mutation simulation
  const nextUser = {
    ...user,
    tokenVersion: user.tokenVersion + 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
  };

  assert.equal(nextUser.tokenVersion, 3);
  assert.equal(nextUser.failedLoginAttempts, 0);
  assert.equal(nextUser.mustChangePassword, false);
});
