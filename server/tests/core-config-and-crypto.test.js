import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { generateOpaqueToken, sha256Hex, verifyHmacSha256 } from '../src/utils/crypto.js';
import { sanitizeUserText, escapeHtml } from '../src/utils/sanitize.js';

const validBaseEnv = {
  NODE_ENV: 'test',
  PORT: '5000',
  APP_BASE_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:5000',
  CORS_ORIGIN: 'http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'tableflow_test',
  DB_USER: 'tableflow_app',
  DB_PASSWORD: 'StrongTestPassword123!',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  COOKIE_SECRET: 'c'.repeat(48),
};

test('loadEnv fails fast when required secrets are missing or too short', () => {
  assert.throws(() => loadEnv({ ...validBaseEnv, JWT_ACCESS_SECRET: 'short' }), /JWT_ACCESS_SECRET/);
  assert.throws(() => loadEnv({ ...validBaseEnv, DB_NAME: '' }), /DB_NAME/);
});

test('loadEnv blocks wildcard CORS in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () =>
        loadEnv({
          ...validBaseEnv,
          NODE_ENV: 'production',
          CORS_ORIGIN: '*',
          RAZORPAY_KEY_ID: 'rzp_test_123',
          RAZORPAY_KEY_SECRET: 'secret',
          RAZORPAY_WEBHOOK_SECRET: 'whsec',
        }),
      /Wildcard CORS_ORIGIN/
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('crypto helpers produce unguessable tokens and verify HMAC signatures safely', () => {
  const t1 = generateOpaqueToken(32);
  const t2 = generateOpaqueToken(32);
  assert.notEqual(t1, t2);
  assert.ok(t1.length >= 43);
  assert.equal(sha256Hex(t1).length, 64);

  const payload = 'order_123|pay_456';
  const secret = 'test_secret_key';
  const crypto = globalThis.crypto;
  assert.ok(crypto);
  assert.equal(verifyHmacSha256(payload, secret, '0'.repeat(64)), false);
});

test('sanitizeUserText strips HTML tags and escapeHtml neutralizes XSS vectors', () => {
  assert.equal(sanitizeUserText('<script>alert(1)</script>Extra spicy please'), 'alert(1)Extra spicy please');
  assert.equal(escapeHtml('<b>Hi</b>'), '&lt;b&gt;Hi&lt;&#x2F;b&gt;');
});
