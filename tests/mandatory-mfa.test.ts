import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDashboardAccess } from '../src/lib/dashboard-guard';
import { AppError } from '../src/lib/api-error';
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

test('Mandatory MFA: checkDashboardAccess redirects restricted session to /mfa-setup', () => {
  // Owner with mfaSetupRequired
  const ownerCheck = checkDashboardAccess('/admin', 'owner', { mfaSetupRequired: true });
  assert.equal(ownerCheck.allowed, false);
  assert.equal(ownerCheck.redirectUrl, '/mfa-setup');

  // Manager with mfaSetupRequired
  const managerCheck = checkDashboardAccess('/admin/staff', 'manager', { mfaSetupRequired: true });
  assert.equal(managerCheck.allowed, false);
  assert.equal(managerCheck.redirectUrl, '/mfa-setup');

  // Any other dashboard path redirected to /mfa-setup
  assert.equal(checkDashboardAccess('/kitchen', 'owner', { mfaSetupRequired: true }).redirectUrl, '/mfa-setup');
  assert.equal(checkDashboardAccess('/staff', 'manager', { mfaSetupRequired: true }).redirectUrl, '/mfa-setup');

  // Allowed on /mfa-setup itself
  const mfaSetupCheck = checkDashboardAccess('/mfa-setup', 'owner', { mfaSetupRequired: true });
  assert.equal(mfaSetupCheck.allowed, true);
  assert.equal(mfaSetupCheck.redirectUrl, '');
});

test('Mandatory MFA: requireStaffAuth blocks privileged user without MFA enrolled unless allowMfaSetup is true', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '101',
        role: 'owner',
        mfaSetupRequired: true,
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

    // Standard staff API without allowMfaSetup -> 403 MFA_SETUP_REQUIRED
    await assert.rejects(
      () => requireStaffAuth(['owner', 'manager']),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'MFA_SETUP_REQUIRED');
        return true;
      }
    );

    // Endpoint with allowMfaSetup: true -> successfully authenticated
    const actor = await requireStaffAuth(['owner', 'manager'], { allowMfaSetup: true });
    assert.equal(actor.id, 101);
    assert.equal(actor.role, 'owner');
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test('Mandatory MFA: chef and waiter without MFA are NOT required to enroll in MFA', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '102',
        role: 'waiter',
        mfaSetupRequired: false,
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

    // Waiter can access floor routes without MFA setup
    const actor = await requireStaffAuth(['waiter', 'owner']);
    assert.equal(actor.id, 102);
    assert.equal(actor.role, 'waiter');
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});
