import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { resetEnvCache } from '../src/config/env.js';
import { setModels } from '../src/db/models/index.js';
import { createApp } from '../src/app.js';
import { requireRole } from '../src/middleware/auth.js';
import { loginStaff, rotateRefreshToken, signAccessToken } from '../src/services/authService.js';
import { sha256Hex } from '../src/utils/crypto.js';

function setupTestEnv() {
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

test('requireRole enforces deny-by-default RBAC', () => {
  const guard = requireRole('owner', 'manager');

  let err1 = null;
  guard({ user: null }, {}, (e) => {
    err1 = e;
  });
  assert.equal(err1.statusCode, 403);

  let err2 = null;
  guard({ user: { id: 2, role: 'waiter' } }, {}, (e) => {
    err2 = e;
  });
  assert.equal(err2.statusCode, 403);

  let err3 = 'not_called';
  guard({ user: { id: 1, role: 'owner' } }, {}, (e) => {
    err3 = e;
  });
  assert.equal(err3, undefined);
});

test('POST /api/auth/login rejects unknown fields via Zod .strict()', async () => {
  setupTestEnv();
  const app = createApp();
  const res = await request(app).post('/api/auth/login').send({
    email: 'owner@tableflow.local',
    password: 'StrongPassword123!',
    role: 'owner',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/refresh rejects missing CSRF token', async () => {
  setupTestEnv();
  const app = createApp();
  const res = await request(app).post('/api/auth/refresh').send({});
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CSRF_INVALID');
});

test('loginStaff locks account after 5 failed attempts and resets on valid login', async () => {
  setupTestEnv();
  const passwordHash = await bcrypt.hash('CorrectPass!123', 10);
  const storedTokens = [];

  const mockUser = {
    id: 10,
    name: 'Test Manager',
    email: 'manager@tableflow.local',
    password_hash: passwordHash,
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    token_version: 1,
    role: { name: 'manager' },
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
    async increment(field, { by }) {
      this[field] += by;
    },
  };

  setModels({
    User: {
      async findOne({ where }) {
        return where.email === mockUser.email ? mockUser : null;
      },
      async findByPk(id) {
        return id === mockUser.id ? mockUser : null;
      },
    },
    Role: {},
    RefreshToken: {
      async create(row) {
        const rec = {
          id: storedTokens.length + 1,
          ...row,
          revoked_at: null,
          replaced_by_hash: null,
          user: mockUser,
          async update(patch) {
            Object.assign(this, patch);
            return this;
          },
        };
        storedTokens.push(rec);
        return rec;
      },
      async findOne({ where }) {
        return storedTokens.find((t) => t.token_hash === where.token_hash) || null;
      },
      async update(patch, { where }) {
        for (const t of storedTokens) {
          if (t.family_id === where.family_id && t.revoked_at === null) {
            Object.assign(t, patch);
          }
        }
      },
    },
    AuditLog: {
      async create() {
        return {};
      },
    },
    sequelize: {
      async transaction(fn) {
        return fn({});
      },
    },
  });

  // 4 failures -> 401
  for (let i = 0; i < 4; i++) {
    await assert.rejects(
      () => loginStaff({ email: 'manager@tableflow.local', password: 'WrongPassword!' }),
      (err) => err.statusCode === 401
    );
  }
  // 5th failure -> 423 Locked
  await assert.rejects(
    () => loginStaff({ email: 'manager@tableflow.local', password: 'WrongPassword!' }),
    (err) => err.statusCode === 423 && err.code === 'ACCOUNT_LOCKED'
  );

  // Unlock and verify valid login + token rotation + reuse detection
  mockUser.locked_until = null;
  mockUser.failed_login_attempts = 0;
  const loginRes = await loginStaff({ email: 'manager@tableflow.local', password: 'CorrectPass!123' });
  assert.ok(loginRes.accessToken);
  assert.equal(loginRes.user.role, 'manager');

  const rotated = await rotateRefreshToken({ rawRefreshToken: loginRes.rawRefreshToken });
  assert.notEqual(rotated.rawRefreshToken, loginRes.rawRefreshToken);

  // Reusing the old refresh token revokes the entire family and bumps token_version
  await assert.rejects(
    () => rotateRefreshToken({ rawRefreshToken: loginRes.rawRefreshToken }),
    (err) => err.code === 'REFRESH_REUSED'
  );
  assert.equal(mockUser.token_version, 2);
  const rotatedRecord = storedTokens.find((t) => t.token_hash === sha256Hex(rotated.rawRefreshToken));
  assert.ok(rotatedRecord.revoked_at);
});

test('requireAuth blocks requests when token_version has been bumped', async () => {
  setupTestEnv();
  const mockUser = {
    id: 1,
    name: 'Owner',
    email: 'owner@tableflow.local',
    is_active: true,
    token_version: 2,
    role: { name: 'owner' },
  };
  setModels({
    User: {
      async findByPk() {
        return mockUser;
      },
    },
    Role: {},
  });

  const staleToken = signAccessToken({ id: 1, name: 'Owner', token_version: 1 }, 'owner');
  const app = createApp();
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${staleToken}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'TOKEN_REVOKED');
});
