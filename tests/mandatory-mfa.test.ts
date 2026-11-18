import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDashboardAccess } from '../src/lib/dashboard-guard';
import { requireStaffAuth, setSessionResolver, resetSessionResolver } from '../src/lib/auth-guard';
import { prisma } from '../src/lib/prisma';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('Optional MFA: checkDashboardAccess allows owner and manager without mandatory MFA redirect', () => {
  // Owner without MFA is allowed to access /admin
  const ownerCheck = checkDashboardAccess('/admin', 'owner');
  assert.equal(ownerCheck.allowed, true);
  assert.equal(ownerCheck.redirectUrl, '');

  // Manager without MFA is allowed to access /admin
  const managerCheck = checkDashboardAccess('/admin', 'manager');
  assert.equal(managerCheck.allowed, true);
  assert.equal(managerCheck.redirectUrl, '');

  // Waiter is allowed to access /staff
  const waiterCheck = checkDashboardAccess('/staff', 'waiter');
  assert.equal(waiterCheck.allowed, true);
  assert.equal(waiterCheck.redirectUrl, '');
});

test('Optional MFA: requireStaffAuth allows privileged user without MFA enrolled', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '101',
        role: 'owner',
        tokenVersion: 1,
      },
    }));

    (prisma.user as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async () => ({
      id: 101,
      name: 'Owner Test',
      email: 'owner@tableflow.test',
      isActive: true,
      tokenVersion: 1,
      mfaEnabled: false,
      mfaSecret: null,
      role: { name: 'owner' },
    });

    // Standard staff API without MFA enrolled succeeds (MFA is optional)
    const actor = await requireStaffAuth(['owner', 'manager']);
    assert.equal(actor.id, 101);
    assert.equal(actor.role, 'owner');
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test('Optional MFA: chef and waiter without MFA access their roles normally', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '102',
        role: 'waiter',
        tokenVersion: 1,
      },
    }));

    (prisma.user as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async () => ({
      id: 102,
      name: 'Waiter Test',
      email: 'waiter@tableflow.test',
      isActive: true,
      tokenVersion: 1,
      mfaEnabled: false,
      mfaSecret: null,
      role: { name: 'waiter' },
    });

    const actor = await requireStaffAuth(['waiter', 'owner']);
    assert.equal(actor.id, 102);
    assert.equal(actor.role, 'waiter');
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});
