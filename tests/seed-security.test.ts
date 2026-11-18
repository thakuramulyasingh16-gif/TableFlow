import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assertSeedAllowed, isSeedAllowed, generateStrongPassword } from '../prisma/seed-guard';
import { createOwnerCore, parseCliArgs } from '../scripts/create-owner';

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

test('create-owner CLI parser correctly parses flags', () => {
  const parsed = parseCliArgs([
    '--email',
    'admin@restaurant.com',
    '--username',
    'admin',
    '--name',
    'Head Chef & Owner',
    '--password',
    'SuperSecretPass123!',
    '--allow-multiple-owners',
  ]);

  assert.equal(parsed.email, 'admin@restaurant.com');
  assert.equal(parsed.username, 'admin');
  assert.equal(parsed.name, 'Head Chef & Owner');
  assert.equal(parsed.password, 'SuperSecretPass123!');
  assert.equal(parsed.allowMultipleOwners, true);
});

test('createOwnerCore creates roles, settings, and owner account with mustChangePassword=true', async () => {
  const rolesCreated: unknown[] = [];
  let settingsCreated = false;

  const mockClient = {
    role: {
      upsert: async ({ create }: { create: { name: string } }) => {
        rolesCreated.push(create);
        return { id: rolesCreated.length, name: create.name };
      },
    },
    restaurantSettings: {
      findFirst: async () => null,
      create: async () => {
        settingsCreated = true;
        return { id: 1 };
      },
    },
    user: {
      findFirst: async () => null,
      create: async ({ data }: { data: { email: string; username: string; mustChangePassword: boolean; isActive: boolean } }) => {
        return { id: 1, ...data };
      },
    },
  };

  const res = await createOwnerCore(
    { email: 'newowner@test.local', username: 'owner1' },
    mockClient as never
  );

  assert.equal(rolesCreated.length, 4);
  assert.equal(settingsCreated, true);
  assert.equal(res.user.email, 'newowner@test.local');
  assert.equal(res.user.username, 'owner1');
  assert.equal(res.user.mustChangePassword, true);
  assert.equal(res.user.isActive, true);
  assert.ok(res.password.length >= 24);
});

test('createOwnerCore refuses to create second owner unless allowMultipleOwners is true', async () => {
  const existingOwner = {
    id: 1,
    name: 'Existing Owner',
    email: 'existing@test.local',
    username: 'existing',
    isActive: true,
  };

  const mockClient = {
    role: {
      upsert: async ({ create }: { create: { name: string } }) => ({ id: 1, name: create.name }),
    },
    restaurantSettings: {
      findFirst: async () => ({ id: 1 }),
    },
    user: {
      findFirst: async () => existingOwner,
      create: async ({ data }: { data: { email: string } }) => ({ id: 2, ...data }),
    },
  };

  // 1. Without allowMultipleOwners -> throws error
  await assert.rejects(
    () => createOwnerCore({ email: 'second@test.local' }, mockClient as never),
    /An active owner account already exists/
  );

  // 2. With allowMultipleOwners -> succeeds
  const res = await createOwnerCore(
    { email: 'second@test.local', allowMultipleOwners: true },
    mockClient as never
  );
  assert.equal(res.user.email, 'second@test.local');
});
