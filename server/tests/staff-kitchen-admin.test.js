import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resetEnvCache } from '../src/config/env.js';
import { setModels } from '../src/db/models/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/services/authService.js';
import { saveValidatedImage } from '../src/middleware/upload.js';

function setupEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '5000',
    APP_BASE_URL: 'http://localhost:5173',
    API_BASE_URL: 'http://localhost:5000',
    CORS_ORIGIN: 'http://localhost:5173',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_NAME: 'tableflow_test',
    DB_USER: 'tableflow_app',
    DB_PASSWORD: 'StrongTestPassword123!',
    JWT_ACCESS_SECRET: 'dummy-access'.padEnd(48, 'a'),
    JWT_REFRESH_SECRET: 'dummy-refresh'.padEnd(48, 'b'),
    COOKIE_SECRET: 'dummy-cookie'.padEnd(48, 'c'),
  });
  resetEnvCache();
}

function mockUsersByRole() {
  const users = new Map([
    [1, { id: 1, name: 'Owner', email: 'o@t.local', is_active: true, token_version: 1, role: { name: 'owner' } }],
    [2, { id: 2, name: 'Manager', email: 'm@t.local', is_active: true, token_version: 1, role: { name: 'manager' } }],
    [3, { id: 3, name: 'Waiter', email: 'w@t.local', is_active: true, token_version: 1, role: { name: 'waiter' } }],
    [4, { id: 4, name: 'Chef', email: 'c@t.local', is_active: true, token_version: 1, role: { name: 'chef' } }],
  ]);
  setModels({
    User: {
      async findByPk(id) {
        return users.get(id) || null;
      },
      async findAll() {
        return [...users.values()];
      },
    },
    Role: {},
    Table: { async findAll() { return []; } },
    Order: { async findAll() { return []; } },
    WaiterCall: { async findAll() { return []; } },
    KitchenStation: { async findAll() { return []; } },
  });
}

test('RBAC separates staff, kitchen, and owner-only admin routes', async () => {
  setupEnv();
  mockUsersByRole();
  const app = createApp();

  const waiterToken = signAccessToken({ id: 3, name: 'Waiter', token_version: 1 }, 'waiter');
  const managerToken = signAccessToken({ id: 2, name: 'Manager', token_version: 1 }, 'manager');
  const chefToken = signAccessToken({ id: 4, name: 'Chef', token_version: 1 }, 'chef');
  const ownerToken = signAccessToken({ id: 1, name: 'Owner', token_version: 1 }, 'owner');

  // Unauthenticated denied
  const unauthRes = await request(app).get('/api/staff/floor');
  assert.equal(unauthRes.status, 401);

  // Waiter allowed on floor, denied on kitchen and admin
  assert.equal((await request(app).get('/api/staff/floor').set('Authorization', `Bearer ${waiterToken}`)).status, 200);
  assert.equal((await request(app).get('/api/kitchen/queue').set('Authorization', `Bearer ${waiterToken}`)).status, 403);
  assert.equal((await request(app).get('/api/admin/staff').set('Authorization', `Bearer ${waiterToken}`)).status, 403);

  // Chef allowed on kitchen, denied on staff floor
  assert.equal((await request(app).get('/api/kitchen/queue').set('Authorization', `Bearer ${chefToken}`)).status, 200);
  assert.equal((await request(app).get('/api/staff/floor').set('Authorization', `Bearer ${chefToken}`)).status, 403);

  // Manager denied on owner-only /api/admin/staff, Owner allowed
  assert.equal((await request(app).get('/api/admin/staff').set('Authorization', `Bearer ${managerToken}`)).status, 403);
  assert.equal((await request(app).get('/api/admin/staff').set('Authorization', `Bearer ${ownerToken}`)).status, 200);
});

test('saveValidatedImage rejects spoofed non-image magic bytes', async () => {
  const fakeExeBuffer = Buffer.from('MZ\x90\x00This is an executable disguised as PNG');
  await assert.rejects(
    () => saveValidatedImage({ buffer: fakeExeBuffer, mimetype: 'image/png' }),
    (err) => err.code === 'INVALID_IMAGE_MAGIC'
  );
});
