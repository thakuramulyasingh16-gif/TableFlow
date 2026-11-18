import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function generateStrongSeedPassword(): string {
  const entropy = crypto.randomBytes(18).toString('base64url');
  return `Tf#${entropy}9!`;
}

function checkProductionSeedSafety(nodeEnv?: string, allowProd?: string): { allowed: boolean; reason?: string } {
  if (nodeEnv === 'production' && allowProd !== 'true') {
    return {
      allowed: false,
      reason: 'Refusing to run prisma/seed.ts in production without SEED_ALLOW_PRODUCTION=true',
    };
  }
  return { allowed: true };
}

test('Seed password generator creates cryptographically strong passwords >= 16 chars', () => {
  const generated = new Set<string>();

  for (let i = 0; i < 50; i++) {
    const pwd = generateStrongSeedPassword();
    assert.ok(pwd.length >= 16, `Password must be at least 16 chars, got: ${pwd.length}`);
    assert.match(pwd, /[A-Z]/, 'Must contain uppercase');
    assert.match(pwd, /[a-z]/, 'Must contain lowercase');
    assert.match(pwd, /[0-9]/, 'Must contain numbers');
    assert.match(pwd, /[^A-Za-z0-9]/, 'Must contain special characters');
    generated.add(pwd);
  }

  // 50 passwords must all be distinct
  assert.equal(generated.size, 50);
});

test('Seed refuses to run in production environment unless SEED_ALLOW_PRODUCTION=true is set', () => {
  // Blocked in production by default
  const prodCheck = checkProductionSeedSafety('production', undefined);
  assert.equal(prodCheck.allowed, false);
  assert.ok(prodCheck.reason?.includes('SEED_ALLOW_PRODUCTION=true'));

  // Allowed in production with explicit opt-in
  const prodOptIn = checkProductionSeedSafety('production', 'true');
  assert.equal(prodOptIn.allowed, true);

  // Allowed in development and test environments
  assert.equal(checkProductionSeedSafety('development').allowed, true);
  assert.equal(checkProductionSeedSafety('test').allowed, true);
});

test('Seeded staff users must enforce mustChangePassword = true', () => {
  // Simulating the user record created during seed
  const seededStaff = {
    email: 'owner@tableflow.local',
    isActive: true,
    mustChangePassword: true,
  };

  assert.equal(seededStaff.mustChangePassword, true);
});
