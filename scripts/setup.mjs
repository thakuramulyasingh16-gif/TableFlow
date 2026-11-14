#!/usr/bin/env node
/**
 * TableFlow - One-Command Fresh Machine Setup
 *
 * Runs:
 * 1. .env creation with cryptographic secrets from .env.example
 * 2. npm install (if needed)
 * 3. PostgreSQL Docker container provisioning (if local port is closed)
 * 4. Database creation (if missing)
 * 5. prisma generate
 * 6. prisma migrate deploy
 * 7. prisma/seed.ts (populates sample tables, menu, categories, deals, staff)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');
const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('======================================================================');
console.log('              TABLEFLOW FRESH MACHINE SETUP                           ');
console.log('======================================================================\n');

// 1. Ensure .env exists
if (!fs.existsSync(envPath)) {
  console.log('[1/6] Creating .env from .env.example...');
  if (!fs.existsSync(envExamplePath)) {
    console.error('❌ .env.example not found!');
    process.exit(1);
  }
  let content = fs.readFileSync(envExamplePath, 'utf8');
  const authSecret = crypto.randomBytes(48).toString('hex');
  const guestSecret = crypto.randomBytes(48).toString('hex');

  content = content.replace(/replace_with_at_least_32_char_random_hex_auth_secret/g, authSecret);
  content = content.replace(/replace_with_at_least_32_char_random_hex_guest_cookie_secret/g, guestSecret);

  // Default local docker port 5433 to avoid conflicts with existing standard Postgres on 5432
  content = content.replace(
    'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/tableflow?schema=public',
    'DATABASE_URL=postgresql://postgres:tableflow_local_dev_db@127.0.0.1:5433/tableflow?schema=public'
  );
  content = content.replace(
    'DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/tableflow?schema=public',
    'DIRECT_URL=postgresql://postgres:tableflow_local_dev_db@127.0.0.1:5433/tableflow?schema=public'
  );

  fs.writeFileSync(envPath, content, 'utf8');
  console.log('  ✓ Created .env with fresh 96-char hex security secrets.');
} else {
  console.log('[1/6] .env file already present.');
}

// Read DATABASE_URL from .env
const envFile = fs.readFileSync(envPath, 'utf8');
let dbUrl = '';
for (const line of envFile.split(/\r?\n/)) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

function parsePostgresUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || '127.0.0.1',
      port: parseInt(u.port || '5432', 10),
      database: u.pathname.replace(/^\//, '') || 'tableflow',
      username: decodeURIComponent(u.username || 'postgres'),
      password: decodeURIComponent(u.password || ''),
    };
  } catch {
    return { host: '127.0.0.1', port: 5433, database: 'tableflow', username: 'postgres', password: 'tableflow_local_dev_db' };
  }
}

const dbInfo = parsePostgresUrl(dbUrl);

function testTcpPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    s.setTimeout(timeoutMs);
    s.once('connect', () => {
      done = true;
      s.destroy();
      resolve(true);
    });
    s.once('timeout', () => {
      if (!done) {
        done = true;
        s.destroy();
        resolve(false);
      }
    });
    s.once('error', () => {
      if (!done) {
        done = true;
        s.destroy();
        resolve(false);
      }
    });
    s.connect(port, host);
  });
}

// 2. Ensure Database Service is Available
console.log('\n[2/6] Checking PostgreSQL database service...');
let isPortOpen = await testTcpPort(dbInfo.host, dbInfo.port);
if (!isPortOpen) {
  console.log(`  ℹ Port ${dbInfo.port} is not listening. Attempting to start/create Docker container...`);
  try {
    // Check if container tableflow-pg exists
    let containerExists = false;
    try {
      const inspect = execSync('docker inspect tableflow-pg', { stdio: 'pipe', encoding: 'utf8' });
      containerExists = !!inspect;
    } catch {
      containerExists = false;
    }

    if (containerExists) {
      console.log('  ℹ Starting existing "tableflow-pg" container...');
      execSync('docker start tableflow-pg', { stdio: 'inherit' });
    } else {
      console.log('  ℹ Launching new "tableflow-pg" PostgreSQL 16 container...');
      execSync(
        `docker run -d --name tableflow-pg -p ${dbInfo.port}:5432 -e POSTGRES_PASSWORD=${dbInfo.password || 'tableflow_local_dev_db'} -e POSTGRES_DB=${dbInfo.database} postgres:16-alpine`,
        { stdio: 'inherit' }
      );
    }

    console.log('  ℹ Waiting 4 seconds for PostgreSQL to initialize...');
    await new Promise((r) => setTimeout(r, 4000));
    isPortOpen = await testTcpPort(dbInfo.host, dbInfo.port, 3000);
  } catch (err) {
    console.warn(`  ⚠️ Could not auto-manage Docker container: ${err.message}`);
  }
}

if (!isPortOpen) {
  console.error(`❌ PostgreSQL is not reachable at ${dbInfo.host}:${dbInfo.port}.`);
  console.error('   Please start Docker Desktop or your local PostgreSQL service and re-run "npm run setup".');
  process.exit(1);
}
console.log(`  ✓ PostgreSQL reachable on ${dbInfo.host}:${dbInfo.port}`);

// 3. Generate Prisma Client
console.log('\n[3/6] Generating Prisma client...');
try {
  execSync(`${npxCmd} prisma generate`, { stdio: 'inherit', cwd: rootDir });
  console.log('  ✓ Prisma client generated.');
} catch (err) {
  console.error(`❌ Failed to generate Prisma client: ${err.message}`);
  process.exit(1);
}

// 4. Run Migrations
console.log('\n[4/6] Deploying database migrations...');
try {
  execSync(`${npxCmd} prisma migrate deploy`, { stdio: 'inherit', cwd: rootDir });
  console.log('  ✓ Migrations deployed.');
} catch (err) {
  console.error(`❌ Failed to deploy migrations: ${err.message}`);
  process.exit(1);
}

// 5. Seed Database
console.log('\n[5/6] Seeding demo data (tables, categories, menu items, staff accounts)...');
try {
  execSync(`${npxCmd} tsx prisma/seed.ts`, { stdio: 'inherit', cwd: rootDir });
  console.log('  ✓ Demo data seeded.');
} catch (err) {
  console.error(`❌ Failed to seed database: ${err.message}`);
  process.exit(1);
}

// 6. Verification
console.log('\n[6/6] Running final database verification check...');
try {
  execSync(`node scripts/db-check.mjs`, { stdio: 'inherit', cwd: rootDir });
} catch (err) {
  console.error(`❌ db:check failed: ${err.message}`);
  process.exit(1);
}

console.log('\n======================================================================');
console.log('  🎉 SETUP COMPLETE! You can now start the application with:         ');
console.log('       npm run dev                                                    ');
console.log('     or double-click "start-tableflow.bat" on Windows.                ');
console.log('======================================================================\n');
