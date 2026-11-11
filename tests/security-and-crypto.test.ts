import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadEnv } from '../src/lib/env';
import {
  generateOpaqueToken,
  sha256Hex,
  signCookieValue,
  verifyHmacSha256,
  verifySignedCookieValue,
} from '../src/lib/crypto';
import { escapeHtml, sanitizeUserText } from '../src/lib/sanitize';

const baseEnv = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
};

test('loadEnv fails fast when required secrets are missing or weak', () => {
  assert.throws(() => loadEnv({ ...baseEnv, AUTH_SECRET: 'too-short' }), /AUTH_SECRET/);
  assert.throws(() => loadEnv({ ...baseEnv, DATABASE_URL: '' }), /DATABASE_URL/);
});

test('loadEnv rejects wildcard CORS and missing production keys in production', () => {
  const prev = process.env.NODE_ENV;
  Reflect.set(process.env, 'NODE_ENV', 'production');
  try {
    assert.throws(
      () =>
        loadEnv({
          ...baseEnv,
          NODE_ENV: 'production',
          CORS_ORIGIN: '*',
          RAZORPAY_KEY_ID: 'rzp_test_1',
          RAZORPAY_KEY_SECRET: 'sec',
          RAZORPAY_WEBHOOK_SECRET: 'wh',
          UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
          UPSTASH_REDIS_REST_TOKEN: 'tok',
        }),
      /Wildcard CORS_ORIGIN/
    );
  } finally {
    Reflect.set(process.env, 'NODE_ENV', prev);
  }
});

test('crypto helpers sign/verify guest session cookies and HMAC payloads safely', () => {
  const t1 = generateOpaqueToken(32);
  const t2 = generateOpaqueToken(32);
  assert.notEqual(t1, t2);
  assert.ok(t1.length >= 43);
  assert.equal(sha256Hex(t1).length, 64);

  const secret = 'cookie-signing-secret-1234567890';
  const signed = signCookieValue(t1, secret);
  assert.equal(verifySignedCookieValue(signed, secret), t1);
  assert.equal(verifySignedCookieValue(`${signed}tamper`, secret), null);

  const payload = 'order_1|pay_1';
  const rzpSecret = 'rzp-secret';
  const sig = crypto.createHmac('sha256', rzpSecret).update(payload).digest('hex');
  assert.equal(verifyHmacSha256(payload, rzpSecret, sig), true);
  assert.equal(verifyHmacSha256(payload, rzpSecret, '0'.repeat(64)), false);
});

test('sanitizeUserText removes HTML tags and escapeHtml neutralizes XSS', () => {
  assert.equal(sanitizeUserText('<script>alert(1)</script>Less spicy'), 'alert(1)Less spicy');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
