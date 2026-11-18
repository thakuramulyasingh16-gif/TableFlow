import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  getSessionRealtimeChannel,
  getRoleRealtimeChannel,
  resolveChannelName,
  sanitizeRealtimePayload,
} from '../src/lib/realtime';
import { calculatePollIntervalWithJitter, resolveClientChannel } from '../src/lib/realtime-client';
import { GET as getStaffRealtimeChannel } from '../src/app/api/staff/realtime-channel/route';
import { resetEnvCache } from '../src/lib/env';

test('Realtime Privacy: per-session channels are unguessable and distinct', () => {
  const channel1 = getSessionRealtimeChannel(1);
  const channel2 = getSessionRealtimeChannel(2);
  const channel1Again = getSessionRealtimeChannel(1);

  assert.ok(channel1.startsWith('session_private_1_'), 'channel must use private session prefix');
  assert.ok(channel2.startsWith('session_private_2_'), 'channel must use private session prefix');
  assert.notEqual(channel1, channel2, 'different sessions must have different channel tokens');
  assert.equal(channel1, channel1Again, 'same session must deterministically resolve to the same channel');
  assert.ok(channel1.length > 30, 'token must be long and cryptographically unguessable');
});

test('Realtime Privacy: staff role channels are unguessable and role-separated', () => {
  const staffCh = getRoleRealtimeChannel('staff');
  const kitchenCh = getRoleRealtimeChannel('kitchen');
  const inventoryCh = getRoleRealtimeChannel('inventory');

  assert.ok(staffCh.startsWith('role_private_staff_'), 'staff channel must use private prefix');
  assert.ok(kitchenCh.startsWith('role_private_kitchen_'), 'kitchen channel must use private prefix');
  assert.ok(inventoryCh.startsWith('role_private_inventory_'), 'inventory channel must use private prefix');

  assert.notEqual(staffCh, kitchenCh);
  assert.notEqual(staffCh, inventoryCh);
  assert.notEqual(kitchenCh, inventoryCh);
});

test('Realtime Privacy: resolveChannelName maps legacy/guessable names to unguessable private channels', () => {
  const resolvedSession = resolveChannelName('table_session:42');
  assert.ok(resolvedSession.startsWith('session_private_42_'));

  const resolvedStaff = resolveChannelName('staff:updates');
  assert.ok(resolvedStaff.startsWith('role_private_staff_'));

  const resolvedKitchen = resolveChannelName('kitchen:updates');
  assert.ok(resolvedKitchen.startsWith('role_private_kitchen_'));

  const resolvedInventory = resolveChannelName('inventory');
  assert.ok(resolvedInventory.startsWith('role_private_inventory_'));
});

test('Realtime Privacy: sanitizeRealtimePayload strips staff names and personal identifiers', () => {
  const rawPayload = {
    alertId: 101,
    ingredientName: 'Paneer',
    acknowledgedBy: 'Chef Gordon Ramsay',
    receivedBy: 'Jane Doe',
    changedBy: 'Alice Walker',
    staffName: 'Bob Smith',
    userEmail: 'chef@restaurant.com',
    actorRole: 'chef',
    affectedDishes: ['Shahi Paneer', 'Matar Paneer'],
    nested: {
      staffName: 'Eve Staff',
      allowedField: 'safeValue',
    },
  };

  const sanitized = sanitizeRealtimePayload(rawPayload);

  // Sensitive staff names and emails must be removed
  assert.equal('acknowledgedBy' in sanitized, false, 'acknowledgedBy name must be stripped');
  assert.equal('receivedBy' in sanitized, false, 'receivedBy name must be stripped');
  assert.equal('changedBy' in sanitized, false, 'changedBy name must be stripped');
  assert.equal('staffName' in sanitized, false, 'staffName must be stripped');
  assert.equal('userEmail' in sanitized, false, 'userEmail must be stripped');

  // Business entity fields must be retained
  assert.equal(sanitized.alertId, 101);
  assert.equal(sanitized.ingredientName, 'Paneer');
  assert.equal(sanitized.actorRole, 'chef');
  assert.deepEqual(sanitized.affectedDishes, ['Shahi Paneer', 'Matar Paneer']);

  // Nested sanitization
  const nested = sanitized.nested as Record<string, unknown>;
  assert.equal('staffName' in nested, false, 'nested staffName must be stripped');
  assert.equal(nested.allowedField, 'safeValue');
});

test('Realtime Privacy: calculatePollIntervalWithJitter produces bounded jittered intervals', () => {
  const baseMs = 20000;
  const jitterFraction = 0.25;

  const intervals: number[] = [];
  for (let i = 0; i < 50; i++) {
    const val = calculatePollIntervalWithJitter(baseMs, jitterFraction);
    assert.ok(val >= 15000 && val <= 25000, `interval ${val} must be within 15000-25000ms`);
    intervals.push(val);
  }

  // Ensure there is actual randomness (not all identical values)
  const uniqueVals = new Set(intervals);
  assert.ok(uniqueVals.size > 10, 'jitter must produce variable intervals');
});

test('Realtime Privacy: resolveClientChannel allows unguessable private channels and blocks unknown staff lookups on failure', async () => {
  // Directly passes unguessable private channels
  const directSession = await resolveClientChannel('session_private_99_abcdef');
  assert.equal(directSession, 'session_private_99_abcdef');

  const directRole = await resolveClientChannel('role_private_staff_123456');
  assert.equal(directRole, 'role_private_staff_123456');

  // Without auth / in unauthenticated test fetch environment, staff lookup returns null (blocked)
  const guestBlockedStaff = await resolveClientChannel('staff:updates');
  assert.equal(guestBlockedStaff, null, 'unauthorized client must not resolve staff channel');
});

test('Realtime Privacy: GET /api/staff/realtime-channel rejects unauthenticated requests with 401', async () => {
  const req = new NextRequest('http://localhost:3000/api/staff/realtime-channel', {
    method: 'GET',
  });

  const res = await getStaffRealtimeChannel(req, { params: Promise.resolve({}) });
  assert.equal(res.status, 401, 'unauthenticated request must return 401 Unauthorized');
});

test('Realtime Privacy: REALTIME_CHANNEL_SECRET derives HMACs independently of GUEST_COOKIE_SECRET', () => {
  const originalRealtimeSecret = process.env.REALTIME_CHANNEL_SECRET;
  const originalGuestSecret = process.env.GUEST_COOKIE_SECRET;

  try {
    process.env.GUEST_COOKIE_SECRET = 'replace_with_test_guest_cookie_secret_val_1234'.padEnd(48, 'a');
    process.env.REALTIME_CHANNEL_SECRET = 'replace_with_test_realtime_channel_secret_alpha_99'.padEnd(48, 'x');
    resetEnvCache();
    const chA = getSessionRealtimeChannel(10);

    process.env.REALTIME_CHANNEL_SECRET = 'replace_with_test_realtime_channel_secret_bravo_88'.padEnd(48, 'y');
    resetEnvCache();
    const chB = getSessionRealtimeChannel(10);

    // Different REALTIME_CHANNEL_SECRET yields different HMAC channel
    assert.notEqual(chA, chB);
    assert.ok(chA.startsWith('session_private_10_'));
    assert.ok(chB.startsWith('session_private_10_'));

    // Changing GUEST_COOKIE_SECRET has NO effect when REALTIME_CHANNEL_SECRET is present
    process.env.GUEST_COOKIE_SECRET = 'replace_with_test_guest_cookie_secret_val_5678'.padEnd(48, 'z');
    resetEnvCache();
    const chB2 = getSessionRealtimeChannel(10);
    assert.equal(chB, chB2);
  } finally {
    process.env.REALTIME_CHANNEL_SECRET = originalRealtimeSecret;
    process.env.GUEST_COOKIE_SECRET = originalGuestSecret;
    resetEnvCache();
  }
});
