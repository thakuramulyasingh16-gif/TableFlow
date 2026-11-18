import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assertSeedAllowed, isSeedAllowed, generateStrongPassword } from '../prisma/seed-guard';

test('assertSeedAllowed refuses in production environment without explicit opt-in', () => {
  // Refuses in production when SEED_ALLOW_PRODUCTION is unset or not 'true'
  assert.throws(
    () => assertSeedAllowed({ NODE_ENV: 'production' }),
    /Refusing to run database seed or credential reset in production environment/
  );

  assert.throws(
    () => assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: 'false' }),
    /Refusing to run database seed or credential reset in production environment/
  );

  assert.equal(isSeedAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(isSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: '0' }), false);
});

test('assertSeedAllowed allows in production when SEED_ALLOW_PRODUCTION=true is explicitly set', () => {
  assert.doesNotThrow(() => {
    assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: 'true' });
  });

  assert.equal(isSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: 'true' }), true);
});

test('assertSeedAllowed allows in development and test environments', () => {
  assert.doesNotThrow(() => {
    assertSeedAllowed({ NODE_ENV: 'development' });
  });

  assert.doesNotThrow(() => {
    assertSeedAllowed({ NODE_ENV: 'test' });
  });

  assert.doesNotThrow(() => {
    assertSeedAllowed({});
  });

  assert.equal(isSeedAllowed({ NODE_ENV: 'development' }), true);
  assert.equal(isSeedAllowed({ NODE_ENV: 'test' }), true);
});

test('generateStrongPassword generates unique passwords >= 24 chars without legacy demo strings', () => {
  const generated = new Set<string>();
  const legacyDemoString = ['TableFlow', '@', '2026'].join('');

  for (let i = 0; i < 50; i++) {
    const pwd = generateStrongPassword();
    assert.ok(pwd.length >= 24, `Password must be at least 24 chars, got length ${pwd.length}: ${pwd}`);
    assert.match(pwd, /[A-Z]/, 'Must contain uppercase character');
    assert.match(pwd, /[a-z]/, 'Must contain lowercase character');
    assert.match(pwd, /[0-9]/, 'Must contain numeric digit');
    assert.match(pwd, /[^A-Za-z0-9]/, 'Must contain special character');
    assert.equal(
      pwd.includes(legacyDemoString),
      false,
      'Generated password must not contain legacy demo password text'
    );
    generated.add(pwd);
  }

  // All 50 calls produce unique passwords
  assert.equal(generated.size, 50);
});

test('No tracked file contains the exposed legacy demo password', () => {
  const legacyPattern = ['TableFlow', '@', '2026'].join('');
  let matches = '';
  try {
    matches = execFileSync('git', ['grep', '-n', legacyPattern], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    // git grep exits with 1 when no matches are found, which is expected
    matches = '';
  }

  assert.equal(
    matches.trim(),
    '',
    `Found occurrences of legacy demo password in tracked files:\n${matches}`
  );
});
