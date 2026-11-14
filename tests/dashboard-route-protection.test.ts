import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDashboardAccess, getAuthorizedDashboard } from '../src/lib/dashboard-guard';

test('Dashboard protection: unauthenticated users redirected to /login with callbackUrl', () => {
  const adminCheck = checkDashboardAccess('/admin', undefined);
  assert.equal(adminCheck.allowed, false);
  assert.equal(adminCheck.redirectUrl, '/login?callbackUrl=%2Fadmin');

  const kitchenCheck = checkDashboardAccess('/kitchen', undefined);
  assert.equal(kitchenCheck.allowed, false);
  assert.equal(kitchenCheck.redirectUrl, '/login?callbackUrl=%2Fkitchen');

  const staffCheck = checkDashboardAccess('/staff', undefined);
  assert.equal(staffCheck.allowed, false);
  assert.equal(staffCheck.redirectUrl, '/login?callbackUrl=%2Fstaff');

  const chefCheck = checkDashboardAccess('/chef', undefined);
  assert.equal(chefCheck.allowed, false);
  assert.equal(chefCheck.redirectUrl, '/login?callbackUrl=%2Fchef');
});

test('Dashboard protection: wrong roles redirected to their authorized dashboard', () => {
  // Waiter attempting to access /admin -> redirected to /staff
  const waiterOnAdmin = checkDashboardAccess('/admin', 'waiter');
  assert.equal(waiterOnAdmin.allowed, false);
  assert.equal(waiterOnAdmin.redirectUrl, '/staff');

  // Waiter attempting to access /kitchen -> redirected to /staff
  const waiterOnKitchen = checkDashboardAccess('/kitchen', 'waiter');
  assert.equal(waiterOnKitchen.allowed, false);
  assert.equal(waiterOnKitchen.redirectUrl, '/staff');

  // Chef attempting to access /admin -> redirected to /kitchen
  const chefOnAdmin = checkDashboardAccess('/admin', 'chef');
  assert.equal(chefOnAdmin.allowed, false);
  assert.equal(chefOnAdmin.redirectUrl, '/kitchen');

  // Chef attempting to access /staff -> redirected to /kitchen
  const chefOnStaff = checkDashboardAccess('/staff', 'chef');
  assert.equal(chefOnStaff.allowed, false);
  assert.equal(chefOnStaff.redirectUrl, '/kitchen');
});

test('Dashboard protection: authorized roles granted access', () => {
  // Owner has access across all dashboards
  assert.equal(checkDashboardAccess('/admin', 'owner').allowed, true);
  assert.equal(checkDashboardAccess('/admin/staff', 'owner').allowed, true);
  assert.equal(checkDashboardAccess('/kitchen', 'owner').allowed, true);
  assert.equal(checkDashboardAccess('/staff', 'owner').allowed, true);

  // Manager has access across all dashboards
  assert.equal(checkDashboardAccess('/admin', 'manager').allowed, true);
  assert.equal(checkDashboardAccess('/kitchen', 'manager').allowed, true);
  assert.equal(checkDashboardAccess('/staff', 'manager').allowed, true);

  // Chef has access to /kitchen and /chef
  assert.equal(checkDashboardAccess('/kitchen', 'chef').allowed, true);
  assert.equal(checkDashboardAccess('/chef', 'chef').allowed, true);

  // Waiter has access to /staff
  assert.equal(checkDashboardAccess('/staff', 'waiter').allowed, true);
});

test('Dashboard helper: getAuthorizedDashboard maps roles to landing pages', () => {
  assert.equal(getAuthorizedDashboard('chef'), '/kitchen');
  assert.equal(getAuthorizedDashboard('owner'), '/admin');
  assert.equal(getAuthorizedDashboard('manager'), '/admin');
  assert.equal(getAuthorizedDashboard('waiter'), '/staff');
  assert.equal(getAuthorizedDashboard(undefined), '/login');
  assert.equal(getAuthorizedDashboard('unknown'), '/login');
});
