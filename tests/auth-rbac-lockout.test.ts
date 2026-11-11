import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAllowedRole } from '../src/lib/rbac';
import { enforceRateLimit, resetMemoryRateLimits } from '../src/lib/rate-limit';
import { createGuestOrderSchema, initGuestSessionSchema } from '../src/lib/validators';

test('checkAllowedRole enforces deny-by-default RBAC', () => {
  assert.equal(checkAllowedRole(undefined, ['owner']), false);
  assert.equal(checkAllowedRole('waiter', ['owner', 'manager']), false);
  assert.equal(checkAllowedRole('chef', ['waiter', 'manager', 'owner']), false);
  assert.equal(checkAllowedRole('waiter', ['waiter', 'manager', 'owner']), true);
  assert.equal(checkAllowedRole('owner', []), false);
});

test('Zod .strict() schemas reject unknown fields such as client-supplied price or role', () => {
  const badOrder = createGuestOrderSchema.safeParse({
    items: [{ menuItemId: 1, quantity: 1 }],
    totalPaise: 100, // forbidden client price override
  });
  assert.equal(badOrder.success, false);

  const badInit = initGuestSessionSchema.safeParse({
    tableToken: 'a'.repeat(32),
    tableId: 5,
  });
  assert.equal(badInit.success, false);
});

test('enforceRateLimit blocks bursts past bucket limit', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
    AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
    GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  });
  resetMemoryRateLimits();
  for (let i = 0; i < 6; i++) {
    await enforceRateLimit('waiter_call', '127.0.0.1:session-1');
  }
  await assert.rejects(
    () => enforceRateLimit('waiter_call', '127.0.0.1:session-1'),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 429 && err.code === 'RATE_LIMITED'
  );
});
