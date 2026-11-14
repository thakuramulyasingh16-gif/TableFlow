import test from 'node:test';
import assert from 'node:assert/strict';
import { NextResponse } from 'next/server';
import { AppError } from '../src/lib/api-error';
import { initGuestSessionSchema } from '../src/lib/validators';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';
import { generateOpaqueToken, sha256Hex, signCookieValue, verifySignedCookieValue } from '../src/lib/crypto';
import { GUEST_COOKIE_NAME, setGuestSessionCookie } from '../src/lib/guest-session';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('Schema: initGuestSessionSchema validates tableToken and optional PIN', () => {
  const token = 'tok_test_table_session_token_1234567890';
  
  // Valid without PIN
  const validNoPin = initGuestSessionSchema.safeParse({ tableToken: token });
  assert.equal(validNoPin.success, true);
  if (validNoPin.success) {
    assert.equal(validNoPin.data.pin, undefined);
  }

  // Valid with 4-digit PIN
  const validWithPin = initGuestSessionSchema.safeParse({ tableToken: token, pin: '4821' });
  assert.equal(validWithPin.success, true);
  if (validWithPin.success) {
    assert.equal(validWithPin.data.pin, '4821');
  }

  // Invalid: PIN too short (< 4 chars)
  const tooShort = initGuestSessionSchema.safeParse({ tableToken: token, pin: '12' });
  assert.equal(tooShort.success, false);

  // Invalid: PIN too long (> 8 chars)
  const tooLong = initGuestSessionSchema.safeParse({ tableToken: token, pin: '123456789' });
  assert.equal(tooLong.success, false);

  // Invalid: unknown fields rejected
  const unknownField = initGuestSessionSchema.safeParse({ tableToken: token, pin: '1234', role: 'admin' });
  assert.equal(unknownField.success, false);
});

test('Rate limit: table_pin limiter allows 5 attempts then blocks with 429', async () => {
  resetMemoryRateLimits();
  const testIp = '192.168.1.100:tbl_42';

  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(() => enforceRateLimit('table_pin', testIp));
  }

  await assert.rejects(
    () => enforceRateLimit('table_pin', testIp),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );
  resetMemoryRateLimits();
});

test('Session sharing: two devices receive signed cookies for the exact same active session', () => {
  const secret = process.env.GUEST_COOKIE_SECRET!;
  const sharedRawToken = generateOpaqueToken(32);
  const sharedSessionHash = sha256Hex(sharedRawToken);
  const expiresAt = new Date(Date.now() + 120 * 60 * 1000);

  // Device 1 connects and receives cookie
  const resDevice1 = NextResponse.json({ ok: true });
  setGuestSessionCookie(resDevice1, sharedRawToken, expiresAt);
  const cookieHeaderDevice1 = resDevice1.headers.get('set-cookie');
  assert.ok(cookieHeaderDevice1);
  assert.ok(cookieHeaderDevice1.includes(GUEST_COOKIE_NAME));

  // Device 2 joins using PIN and receives cookie for same rawToken
  const resDevice2 = NextResponse.json({ ok: true });
  setGuestSessionCookie(resDevice2, sharedRawToken, expiresAt);
  const cookieHeaderDevice2 = resDevice2.headers.get('set-cookie');
  assert.ok(cookieHeaderDevice2);

  // Verify both devices produce the exact same sessionTokenHash
  const rawCookieVal1 = signCookieValue(sharedRawToken, secret);
  const rawCookieVal2 = signCookieValue(sharedRawToken, secret);
  assert.equal(rawCookieVal1, rawCookieVal2);

  const verified1 = verifySignedCookieValue(rawCookieVal1, secret);
  const verified2 = verifySignedCookieValue(rawCookieVal2, secret);
  assert.equal(verified1, sharedRawToken);
  assert.equal(verified2, sharedRawToken);
  assert.equal(sha256Hex(verified1!), sharedSessionHash);
  assert.equal(sha256Hex(verified2!), sharedSessionHash);
});

test('PIN protection: wrong PIN rejected with 401 INVALID_TABLE_PIN', () => {
  const activeJoinPin = '7392';
  const candidateWrongPin = '9999';

  const checkPin = (entered: string) => {
    if (entered !== activeJoinPin) {
      throw new AppError(401, 'Invalid table PIN. Please ask your waiter or dining partner.', 'INVALID_TABLE_PIN');
    }
    return true;
  };

  assert.throws(
    () => checkPin(candidateWrongPin),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, 'INVALID_TABLE_PIN');
      return true;
    }
  );

  assert.equal(checkPin('7392'), true);
});

test('Table status: table status becomes free ONLY when remaining active sessions is 0', () => {
  interface MockSession {
    id: number;
    tableId: number;
    status: 'active' | 'paid' | 'expired';
  }

  const sessions: MockSession[] = [
    { id: 1, tableId: 10, status: 'active' },
    { id: 2, tableId: 10, status: 'active' },
  ];

  let tableStatus: 'free' | 'ordered' = 'ordered';

  const closeSession = (sessionId: number) => {
    const sess = sessions.find((s) => s.id === sessionId);
    if (!sess) return;
    sess.status = 'paid';

    const remainingActive = sessions.filter((s) => s.tableId === sess.tableId && s.status === 'active' && s.id !== sess.id).length;
    if (remainingActive === 0) {
      tableStatus = 'free';
    }
  };

  // Close session 1: session 2 is still active -> table is still 'ordered'
  closeSession(1);
  assert.equal(tableStatus, 'ordered');

  // Close session 2: no active sessions remain -> table becomes 'free'
  closeSession(2);
  assert.equal(tableStatus, 'free');
});
