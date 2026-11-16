import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parsePostgresUrl,
  checkEnvLocalDiff,
  isNextDevLocked,
  detectPortListener,
} from '../scripts/preflight-utils.mjs';

test('parsePostgresUrl extracts host, port, database, and decouples password safely', () => {
  const url = 'postgresql://myuser:SuperSecretPassword123!@db.internal.host:5433/tableflow_prod?schema=public';
  const parsed = parsePostgresUrl(url);

  assert.equal(parsed.host, 'db.internal.host');
  assert.equal(parsed.port, 5433);
  assert.equal(parsed.database, 'tableflow_prod');
  assert.equal(parsed.username, 'myuser');
});

test('checkEnvLocalDiff returns empty array when .env.local does not exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-test-env-empty-'));
  try {
    const diffs = checkEnvLocalDiff(tmpDir, {
      DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:5433/tableflow?schema=public',
    });
    assert.deepEqual(diffs, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('checkEnvLocalDiff warns when .env.local points to a different host/database without leaking passwords', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-test-env-diff-'));
  try {
    const localContent = `
DATABASE_URL=postgresql://postgres:localPass@127.0.0.1:5432/different_db?schema=public
DIRECT_URL=postgresql://postgres:localPass@127.0.0.1:5432/different_db?schema=public
`;
    fs.writeFileSync(path.join(tmpDir, '.env.local'), localContent, 'utf8');

    const baseEnv = {
      DATABASE_URL: 'postgresql://postgres:envPass@127.0.0.1:5433/tableflow?schema=public',
      DIRECT_URL: 'postgresql://postgres:envPass@127.0.0.1:5433/tableflow?schema=public',
    };

    const diffs = checkEnvLocalDiff(tmpDir, baseEnv);
    assert.equal(diffs.length, 2);

    const dbDiff = diffs.find((d) => d.key === 'DATABASE_URL');
    assert.ok(dbDiff);
    assert.equal(dbDiff.envHost, '127.0.0.1');
    assert.equal(dbDiff.envPort, 5433);
    assert.equal(dbDiff.envDatabase, 'tableflow');
    assert.equal(dbDiff.localHost, '127.0.0.1');
    assert.equal(dbDiff.localPort, 5432);
    assert.equal(dbDiff.localDatabase, 'different_db');

    // Ensure passwords are never present in the diff payload
    const serialized = JSON.stringify(diffs);
    assert.ok(!serialized.includes('localPass'));
    assert.ok(!serialized.includes('envPass'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('isNextDevLocked returns false when lock file does not exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-test-lock-'));
  try {
    assert.equal(isNextDevLocked(tmpDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detectPortListener returns listener status on port 3000', () => {
  const res = detectPortListener(3000);
  assert.equal(typeof res.isListening, 'boolean');
  if (res.isListening) {
    assert.ok(res.pid, 'Must have a PID when listening');
  }
});
