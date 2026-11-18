import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/api-error';
import { assertValidPassword, validatePassword } from '../src/lib/password-policy';

test('Password policy: enforces minimum 8 characters and maximum 72 characters', () => {
  // 7 chars -> fails
  const shortResult = validatePassword('1234567');
  assert.equal(shortResult.valid, false);
  assert.match(shortResult.error!, /at least 8 characters/);

  // 8 chars (uncommon) -> passes
  const valid8 = validatePassword('Xk9#mP2q');
  assert.equal(valid8.valid, true);

  // 72 chars -> passes
  const exact72 = 'A'.repeat(72);
  const res72 = validatePassword(exact72);
  assert.equal(res72.valid, true);

  // 73 chars -> fails
  const tooLong = 'A'.repeat(73);
  const longResult = validatePassword(tooLong);
  assert.equal(longResult.valid, false);
  assert.match(longResult.error!, /cannot exceed 72 characters/);
});

test('Password policy: rejects common and guessable passwords (case-insensitive)', () => {
  const commonSamples = [
    'password',
    'PASSWORD',
    'Password123',
    '12345678',
    'qwertyuiop',
    'tableflow',
    'TableFlow123',
    'admin123',
    'welcome123',
    'letmein123',
    'changeme',
  ];

  for (const pwd of commonSamples) {
    const res = validatePassword(pwd);
    assert.equal(res.valid, false, `Expected "${pwd}" to be rejected as common`);
    assert.match(res.error!, /too common or easily guessable/);
  }
});

test('Password policy: rejects password matching email, username, email prefix, or ID', () => {
  const context = {
    email: 'Chef.Mario@TableFlow.com',
    username: 'chef_mario',
    id: 42,
    name: 'Mario Rossi',
  };

  // Exactly matching username (case-insensitive)
  const userMatch = validatePassword('Chef_Mario', context);
  assert.equal(userMatch.valid, false);
  assert.match(userMatch.error!, /cannot be the same as your username, email, or ID/);

  // Exactly matching email
  const emailMatch = validatePassword('chef.mario@tableflow.com', context);
  assert.equal(emailMatch.valid, false);
  assert.match(emailMatch.error!, /cannot be the same as your username, email, or ID/);

  // Matching email prefix ("chef.mario")
  const prefixMatch = validatePassword('CHEF.MARIO', context);
  assert.equal(prefixMatch.valid, false);
  assert.match(prefixMatch.error!, /cannot be the same as your username, email, or ID/);

  // Matching ID (case-insensitive string representation)
  const idMatch = validatePassword('87654321', { ...context, id: '87654321' });
  assert.equal(idMatch.valid, false);
  assert.match(idMatch.error!, /cannot be the same as your username, email, or ID/);

  // Valid password with no overlap
  const valid = validatePassword('SafeKitchenPass99!', context);
  assert.equal(valid.valid, true);
});

test('Password policy: assertValidPassword throws AppError on failure', () => {
  assert.throws(
    () => assertValidPassword('1234', { username: 'testuser' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'WEAK_PASSWORD');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Does not throw for valid password
  assert.doesNotThrow(() => {
    assertValidPassword('SuperSecretStrong999!', { username: 'testuser' });
  });
});
