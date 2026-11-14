import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../src/lib/api-error';
import { CSRF_COOKIE_NAME, requireCsrf, setCsrfCookie } from '../src/lib/csrf';
import { withStaffAuth } from '../src/lib/auth-guard';
import { generateOpaqueToken } from '../src/lib/crypto';

// Setup basic environment variables for tests
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('CSRF: setCsrfCookie generates and sets cookie with valid format', () => {
  const res = NextResponse.json({ ok: true });
  const token = setCsrfCookie(res);
  assert.ok(token);
  assert.ok(token.length >= 24);
  const cookie = res.cookies.get(CSRF_COOKIE_NAME);
  assert.ok(cookie);
  assert.equal(cookie.value, token);
});

test('CSRF: requireCsrf allows GET requests without token', async () => {
  const req = new NextRequest('http://localhost:3000/api/admin/catalog', {
    method: 'GET',
  });
  await assert.doesNotReject(() => requireCsrf(req));
});

test('CSRF: mutation without token -> 403', async () => {
  const req = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  });

  await assert.rejects(
    () => requireCsrf(req),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_INVALID');
      return true;
    }
  );
});

test('CSRF: mutation with wrong token -> 403', async () => {
  const validToken = generateOpaqueToken(24);
  const wrongToken = generateOpaqueToken(24);

  const req = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
      'x-csrf-token': wrongToken,
    },
  });

  await assert.rejects(
    () => requireCsrf(req),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_INVALID');
      return true;
    }
  );
});

test('CSRF: mutation with token -> OK', async () => {
  const validToken = generateOpaqueToken(24);

  const req = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
      'x-csrf-token': validToken,
    },
  });

  await assert.doesNotReject(() => requireCsrf(req));
});

test('CSRF: blocks cross-site Sec-Fetch-Site header -> 403', async () => {
  const validToken = generateOpaqueToken(24);

  const req = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
      'x-csrf-token': validToken,
      'sec-fetch-site': 'cross-site',
    },
  });

  await assert.rejects(
    () => requireCsrf(req),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_CROSS_SITE');
      return true;
    }
  );
});

test('CSRF: blocks untrusted Origin header -> 403', async () => {
  const validToken = generateOpaqueToken(24);

  const req = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${CSRF_COOKIE_NAME}=${validToken}`,
      'x-csrf-token': validToken,
      origin: 'https://malicious-attacker.evil',
    },
  });

  await assert.rejects(
    () => requireCsrf(req),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'CSRF_ORIGIN_INVALID');
      return true;
    }
  );
});

test('CSRF: withStaffAuth catches CSRF rejection and returns formatted 403', async () => {
  const handler = withStaffAuth(['owner', 'manager'], async () => {
    return NextResponse.json({ success: true });
  });

  // Request without CSRF token
  const reqNoToken = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
  });
  const resNoToken = await handler(reqNoToken);
  assert.equal(resNoToken.status, 403);
  const dataNoToken = (await resNoToken.json()) as { error: { code: string } };
  assert.equal(dataNoToken.error.code, 'CSRF_INVALID');

  // Request with mismatched CSRF token
  const tokenA = generateOpaqueToken(24);
  const tokenB = generateOpaqueToken(24);
  const reqMismatch = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      cookie: `${CSRF_COOKIE_NAME}=${tokenA}`,
      'x-csrf-token': tokenB,
    },
  });
  const resMismatch = await handler(reqMismatch);
  assert.equal(resMismatch.status, 403);
  const dataMismatch = (await resMismatch.json()) as { error: { code: string } };
  assert.equal(dataMismatch.error.code, 'CSRF_INVALID');

  // Request with valid CSRF token, but no staff session -> 401
  const reqValidCsrf = new NextRequest('http://localhost:3000/api/admin/categories', {
    method: 'POST',
    headers: {
      cookie: `${CSRF_COOKIE_NAME}=${tokenA}`,
      'x-csrf-token': tokenA,
    },
  });
  const resValidCsrf = await handler(reqValidCsrf);
  assert.equal(resValidCsrf.status, 401);
});
