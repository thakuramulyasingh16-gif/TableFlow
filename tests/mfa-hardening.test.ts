import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadEnv } from '../src/lib/env';
import { AppError } from '../src/lib/api-error';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';
import {
  encryptMfaSecret,
  decryptMfaSecret,
  generateTotp,
  generateTotpSecret,
  verifyTotpWithReplay,
  generateRecoveryCodes,
  consumeRecoveryCode,
} from '../src/lib/totp';

// 32-byte base64 test key
const valid32ByteBase64Key = crypto.randomBytes(32).toString('base64');

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  MFA_ENCRYPTION_KEY: valid32ByteBase64Key,
});

test('MFA hardening: AES-256-GCM secret encryption and decryption at rest', () => {
  const secret = generateTotpSecret(20);
  const encrypted = encryptMfaSecret(secret);

  assert.ok(encrypted.startsWith('enc:v1:'));
  const parts = encrypted.split(':');
  assert.equal(parts.length, 5);

  // Decryption recovers exact plaintext
  const decrypted = decryptMfaSecret(encrypted);
  assert.equal(decrypted, secret);

  // Tampered ciphertext fails
  const tampered = encrypted.slice(0, -4) + 'AAAA';
  assert.throws(() => decryptMfaSecret(tampered));

  // Legacy unencrypted secret is returned as-is
  const legacy = 'JBSWY3DPEHPK3PXP';
  assert.equal(decryptMfaSecret(legacy), legacy);
});

test('MFA hardening: TOTP replay protection rejects identical or previous time-steps', () => {
  const secret = generateTotpSecret(20);
  const now = 1700000000000; // Fixed timestamp
  const step = 30;
  const currentStep = Math.floor(now / 1000 / step);

  const token = generateTotp(secret, now, step);

  // Initial verification without prior time-step succeeds
  const firstResult = verifyTotpWithReplay(token, secret, null, 1, now, step);
  assert.equal(firstResult.valid, true);
  assert.equal(firstResult.timeStep, currentStep);

  // Replay of same token with lastAcceptedTimeStep = currentStep is rejected
  const replayResult = verifyTotpWithReplay(token, secret, currentStep, 1, now, step);
  assert.equal(replayResult.valid, false);

  // Replay of an older token from step - 1 is rejected
  const pastToken = generateTotp(secret, (currentStep - 1) * step * 1000, step);
  const pastResult = verifyTotpWithReplay(pastToken, secret, currentStep, 1, now, step);
  assert.equal(pastResult.valid, false);

  // Subsequent token in next time-step succeeds
  const futureNow = now + step * 1000;
  const futureStep = currentStep + 1;
  const nextToken = generateTotp(secret, futureNow, step);
  const nextResult = verifyTotpWithReplay(nextToken, secret, currentStep, 1, futureNow, step);
  assert.equal(nextResult.valid, true);
  assert.equal(nextResult.timeStep, futureStep);
});

test('MFA hardening: recovery codes have >= 10 chars base32, stored as HMAC-SHA256, constant-time comparison', () => {
  const { plainCodes, hashedCodes } = generateRecoveryCodes(6);
  assert.equal(plainCodes.length, 6);
  assert.equal(hashedCodes.length, 6);

  for (const code of plainCodes) {
    // Format: XXXXX-XXXXX (10 base32 characters)
    const stripped = code.replace(/-/g, '');
    assert.ok(stripped.length >= 10);
    assert.match(stripped, /^[A-Z2-7]{10,}$/);
  }

  // Stored hashes are 64-character hex strings (HMAC-SHA256)
  for (const hash of hashedCodes) {
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  }

  const jsonHashed = JSON.stringify(hashedCodes);
  const firstCode = plainCodes[0]!;

  // First consumption succeeds
  const remaining = consumeRecoveryCode(firstCode, jsonHashed);
  assert.ok(remaining);
  assert.equal(remaining.length, 5);

  // Reuse fails
  assert.equal(consumeRecoveryCode(firstCode, JSON.stringify(remaining)), null);
});

test('MFA hardening: separate rate limits for per-user and per-IP MFA attempts', async () => {
  resetMemoryRateLimits();

  // Test per-user limit: 5 attempts allowed, 6th blocked
  const testUserId = 'test_user_rate_limit_1';
  for (let i = 0; i < 5; i++) {
    await assert.doesNotReject(() => enforceRateLimit('mfa_verify_user', testUserId));
  }

  await assert.rejects(
    () => enforceRateLimit('mfa_verify_user', testUserId),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );

  // Test per-IP limit: 20 attempts allowed, 21st blocked
  const testIp = '192.168.1.105';
  for (let i = 0; i < 20; i++) {
    await assert.doesNotReject(() => enforceRateLimit('mfa_verify_ip', testIp));
  }

  await assert.rejects(
    () => enforceRateLimit('mfa_verify_ip', testIp),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      return true;
    }
  );
});

test('MFA hardening: MFA_ENCRYPTION_KEY startup validation in production and non-production', () => {
  // Valid key loads cleanly
  const env = loadEnv({
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    CORS_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
    AUTH_SECRET: 'auth-secret-test'.padEnd(48, 'a'),
    GUEST_COOKIE_SECRET: 'guest-secret-test'.padEnd(48, 'b'),
    MFA_ENCRYPTION_KEY: valid32ByteBase64Key,
  });
  assert.equal(env.MFA_ENCRYPTION_KEY, valid32ByteBase64Key);

  // Invalid key length throws
  assert.throws(() => {
    loadEnv({
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      CORS_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      AUTH_SECRET: 'auth-secret-test'.padEnd(48, 'a'),
      GUEST_COOKIE_SECRET: 'guest-secret-test'.padEnd(48, 'b'),
      MFA_ENCRYPTION_KEY: Buffer.from('short').toString('base64'),
    });
  });

  // Missing key in production throws
  assert.throws(() => {
    loadEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://tableflow.vercel.app',
      CORS_ORIGIN: 'https://tableflow.vercel.app',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      AUTH_SECRET: 'auth-secret-test'.padEnd(48, 'a'),
      GUEST_COOKIE_SECRET: 'guest-secret-test'.padEnd(48, 'b'),
      RAZORPAY_KEY_ID: 'rzp_test_dummykey123',
      RAZORPAY_KEY_SECRET: 'rzp_sec_testkey123',
      RAZORPAY_WEBHOOK_SECRET: 'whsec_testkey123',
      UPSTASH_REDIS_REST_URL: 'https://redis.upstash.com',
      UPSTASH_REDIS_REST_TOKEN: 'token123',
      MFA_ENCRYPTION_KEY: '',
    });
  });
});
