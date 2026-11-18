import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { checkDashboardAccess } from '../src/lib/dashboard-guard';
import { AppError } from '../src/lib/api-error';
import { requireStaffAuth, withStaffAuth, setSessionResolver, resetSessionResolver } from '../src/lib/auth-guard';
import { prisma } from '../src/lib/prisma';
import { CSRF_COOKIE_NAME } from '../src/lib/csrf';
import { generateOpaqueToken } from '../src/lib/crypto';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('mustChangePassword: checkDashboardAccess redirects all dashboards to /change-password', () => {
  // Admin dashboard
  const adminCheck = checkDashboardAccess('/admin', 'owner', { mustChangePassword: true });
  assert.equal(adminCheck.allowed, false);
  assert.equal(adminCheck.redirectUrl, '/change-password');

  // Kitchen dashboard
  const kitchenCheck = checkDashboardAccess('/kitchen', 'chef', { mustChangePassword: true });
  assert.equal(kitchenCheck.allowed, false);
  assert.equal(kitchenCheck.redirectUrl, '/change-password');

  // Staff floor dashboard
  const staffCheck = checkDashboardAccess('/staff', 'waiter', { mustChangePassword: true });
  assert.equal(staffCheck.allowed, false);
  assert.equal(staffCheck.redirectUrl, '/change-password');

  // Access to /change-password itself is allowed
  const changePasswordCheck = checkDashboardAccess('/change-password', 'waiter', { mustChangePassword: true });
  assert.equal(changePasswordCheck.allowed, true);
  assert.equal(changePasswordCheck.redirectUrl, '');
});

test('mustChangePassword: requireStaffAuth blocks staff operations on server when flag is active', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '201',
        role: 'waiter',
        mustChangePassword: true,
        tokenVersion: 1,
      },
    }));

    (prisma.user as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async () => ({
      id: 201,
      name: 'Waiter Change Password Test',
      email: 'waiter201@tableflow.test',
      isActive: true,
      tokenVersion: 1,
      mustChangePassword: true,
      mfaEnabled: false,
      mfaSecret: null,
      role: { name: 'waiter' },
    });

    // Attempting general staff operation fails with 403 PASSWORD_CHANGE_REQUIRED
    await assert.rejects(
      () => requireStaffAuth(['waiter', 'owner']),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PASSWORD_CHANGE_REQUIRED');
        return true;
      }
    );

    // Endpoint with allowChangePassword: true succeeds
    const actor = await requireStaffAuth(['waiter', 'owner'], { allowChangePassword: true });
    assert.equal(actor.id, 201);
    assert.equal(actor.role, 'waiter');
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test('mustChangePassword: withStaffAuth rejects standard mutations with 403 and permits password change', async () => {
  const originalFindUnique = prisma.user.findUnique;

  try {
    setSessionResolver(async () => ({
      user: {
        id: '202',
        role: 'manager',
        mustChangePassword: true,
        tokenVersion: 1,
      },
    }));

    (prisma.user as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async () => ({
      id: 202,
      name: 'Manager Change Password Test',
      email: 'mgr202@tableflow.test',
      isActive: true,
      tokenVersion: 1,
      mustChangePassword: true,
      mfaEnabled: true,
      mfaSecret: 'enc:v1:test:test:test',
      role: { name: 'manager' },
    });

    const csrfToken = generateOpaqueToken(24);

    // Handler without allowChangePassword
    const blockedHandler = withStaffAuth(['manager', 'owner'], async () => {
      return NextResponse.json({ success: true });
    });

    const blockedReq = new NextRequest('http://localhost:3000/api/admin/menu', {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfToken,
        cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      },
    });

    const blockedRes = await blockedHandler(blockedReq);
    assert.equal(blockedRes.status, 403);
    const blockedData = (await blockedRes.json()) as { error: { code: string } };
    assert.equal(blockedData.error.code, 'PASSWORD_CHANGE_REQUIRED');

    // Handler with allowChangePassword: true (change-password endpoint)
    const allowedHandler = withStaffAuth(
      ['manager', 'owner'],
      async () => NextResponse.json({ success: true, message: 'Password updated' }),
      { allowChangePassword: true }
    );

    const allowedReq = new NextRequest('http://localhost:3000/api/staff/auth/change-password', {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfToken,
        cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      },
    });

    const allowedRes = await allowedHandler(allowedReq);
    assert.equal(allowedRes.status, 200);
    const allowedData = (await allowedRes.json()) as { success: boolean };
    assert.equal(allowedData.success, true);
  } finally {
    resetSessionResolver();
    (prisma.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});
