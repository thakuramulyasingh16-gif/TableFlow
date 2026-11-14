import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLog, scrubPii } from '../src/lib/logger';
import { isSentryConfigured, initSentry, captureException } from '../src/lib/sentry';
import { checkDashboardAccess } from '../src/lib/dashboard-guard';

test('Structured logger formats entries with timestamp, level, message, context, and requestId', () => {
  const entry = formatLog(
    'info',
    'Order created successfully',
    { orderId: 42, totalPaise: 49900 },
    'req-12345'
  );

  assert.equal(entry.level, 'info');
  assert.equal(entry.message, 'Order created successfully');
  assert.equal(entry.requestId, 'req-12345');
  assert.deepEqual(entry.context, { orderId: 42, totalPaise: 49900 });
  assert.ok(entry.timestamp);
  assert.ok(!isNaN(Date.parse(entry.timestamp)));
});

test('PII scrubber redacts sensitive field names (passwords, secrets, tokens, cookies, pins)', () => {
  const sensitivePayload = {
    username: 'amulya_admin',
    password: 'SuperSecretPassword123!',
    token: 'jwt.token.value',
    secret: 'my-ultra-secret',
    tf_csrf: 'csrf-secret-token',
    tf_guest: 'signed-guest-cookie',
    pin: '1234',
    nested: {
      tablePin: '9876',
      normalField: 'all good',
    },
  };

  const scrubbed = scrubPii(sensitivePayload) as Record<string, unknown>;

  assert.equal(scrubbed.username, 'amulya_admin');
  assert.equal(scrubbed.password, '[REDACTED]');
  assert.equal(scrubbed.token, '[REDACTED]');
  assert.equal(scrubbed.secret, '[REDACTED]');
  assert.equal(scrubbed.tf_csrf, '[REDACTED]');
  assert.equal(scrubbed.tf_guest, '[REDACTED]');
  assert.equal(scrubbed.pin, '[REDACTED]');

  const nested = scrubbed.nested as Record<string, unknown>;
  assert.equal(nested.tablePin, '[REDACTED]');
  assert.equal(nested.normalField, 'all good');
});

test('PII scrubber redacts credit card numbers and Bearer tokens in string values', () => {
  const logMessage = 'Failed transaction for card 4111 1111 1111 1111 with header Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
  const scrubbed = scrubPii(logMessage) as string;

  assert.ok(!scrubbed.includes('4111 1111 1111 1111'));
  assert.ok(scrubbed.includes('[REDACTED_CARD]'));
  assert.ok(!scrubbed.includes('eyJhbGciOiJIUzI1NiJ9.test.sig'));
  assert.ok(scrubbed.includes('[REDACTED_TOKEN]'));
});

test('PII scrubber safely handles circular references without throwing', () => {
  const obj: Record<string, unknown> = { name: 'circular-test' };
  obj.self = obj;

  assert.doesNotThrow(() => {
    const scrubbed = scrubPii(obj) as Record<string, unknown>;
    assert.equal(scrubbed.name, 'circular-test');
    assert.equal(scrubbed.self, '[CIRCULAR]');
  });
});

test('Sentry safe initialization: returns false when DSN is absent and does not throw on capture', () => {
  const prevDsn = process.env.SENTRY_DSN;
  const prevPublicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  try {
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    assert.equal(isSentryConfigured(), false);
    assert.equal(initSentry({ dsn: '' }), false);

    assert.doesNotThrow(() => {
      captureException(new Error('Sample test error without crashing'));
    });
  } finally {
    if (prevDsn) process.env.SENTRY_DSN = prevDsn;
    if (prevPublicDsn) process.env.NEXT_PUBLIC_SENTRY_DSN = prevPublicDsn;
  }
});

test('Dashboard route protection for /admin/audit-logs: allows owner, redirects manager and unauthenticated', () => {
  // 1. Unauthenticated -> redirects to login with callbackUrl
  const unauth = checkDashboardAccess('/admin/audit-logs');
  assert.equal(unauth.allowed, false);
  assert.ok(unauth.redirectUrl.includes('/login'));

  // 2. Manager -> blocked and redirected to /admin
  const managerAccess = checkDashboardAccess('/admin/audit-logs', 'manager');
  assert.equal(managerAccess.allowed, false);
  assert.equal(managerAccess.redirectUrl, '/admin');

  // 3. Waiter -> blocked and redirected to /admin
  const waiterAccess = checkDashboardAccess('/admin/audit-logs', 'waiter');
  assert.equal(waiterAccess.allowed, false);
  assert.equal(waiterAccess.redirectUrl, '/admin');

  // 4. Chef -> blocked and redirected to /admin
  const chefAccess = checkDashboardAccess('/admin/audit-logs', 'chef');
  assert.equal(chefAccess.allowed, false);
  assert.equal(chefAccess.redirectUrl, '/admin');

  // 5. Owner -> allowed!
  const ownerAccess = checkDashboardAccess('/admin/audit-logs', 'owner');
  assert.equal(ownerAccess.allowed, true);
  assert.equal(ownerAccess.redirectUrl, '');
});
