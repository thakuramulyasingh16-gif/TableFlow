#!/usr/bin/env node
/**
 * TableFlow - Predev Preflight Check
 *
 * Runs automatically prior to `next dev` when calling `npm run dev`.
 * Verifies:
 * 1. .env exists and required variables validate against Zod schema
 * 2. Database server is reachable (auto-starts docker container if stopped)
 * 3. Database exists (auto-creates if missing)
 * 4. Migrations are up to date (auto-applies pending migrations)
 * 5. Port 3000 status (identifies process if occupied)
 * 6. Fetches sample table token and prints exact startup URLs
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const isWindows = process.platform === 'win32';

console.log('\n[TableFlow Preflight] Running startup verification...\n');

// --------------------------------------------------------------------
// 1. .env Verification with Zod
// --------------------------------------------------------------------
if (!fs.existsSync(envPath)) {
  if (process.env.CI) {
    const examplePath = path.join(rootDir, '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
    }
  } else {
    console.error('❌ ERROR: .env file is missing!');
    console.error(`   Looked at: ${envPath}`);
    console.error('   Please run "npm run setup" to create .env automatically, or copy .env.example to .env.\n');
    process.exit(1);
  }
}

const rawEnv = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      rawEnv[key] = val;
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Inherit process environment variables (e.g. GitHub Actions env)
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined) {
    rawEnv[k] = v;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  GUEST_COOKIE_SECRET: z.string().min(32, 'GUEST_COOKIE_SECRET must be at least 32 characters'),
  GUEST_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  CGST_BPS: z.coerce.number().int().min(0).default(250),
  SGST_BPS: z.coerce.number().int().min(0).default(250),
});

const parsedEnv = envSchema.safeParse(rawEnv);
if (!parsedEnv.success) {
  console.error('❌ ERROR: .env configuration is invalid or incomplete:');
  for (const issue of parsedEnv.error.issues) {
    const field = issue.path.join('.') || 'root';
    console.error(`   - ${field}: ${issue.message}`);
  }
  console.error('\n   Please fix the values in your .env file or run "npm run setup".\n');
  process.exit(1);
}

console.log('✓ .env verified (all required variables present and valid)');

// --------------------------------------------------------------------
// 2. Database Reachability & Auto-start Docker
// --------------------------------------------------------------------
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
    return { host: '127.0.0.1', port: 5432, database: 'tableflow', username: 'postgres', password: '' };
  }
}

const dbInfo = parsePostgresUrl(rawEnv.DATABASE_URL);

function testTcpPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      resolved = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.once('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

async function ensureDbReachable() {
  let isPortOpen = await testTcpPort(dbInfo.host, dbInfo.port);
  if (!isPortOpen) {
    // Attempt auto-start Docker container if local host
    if (dbInfo.host === '127.0.0.1' || dbInfo.host === 'localhost') {
      try {
        console.log(`ℹ Port ${dbInfo.port} closed. Checking Docker container "tableflow-pg"...`);
        execSync('docker start tableflow-pg', { stdio: 'pipe' });
        console.log('✓ Started Docker container "tableflow-pg". Waiting 3 seconds for PostgreSQL to accept connections...');
        await new Promise((r) => setTimeout(r, 3000));
        isPortOpen = await testTcpPort(dbInfo.host, dbInfo.port, 3000);
      } catch {
        // Docker might not be running or container not named tableflow-pg
      }
    }
  }

  if (!isPortOpen) {
    console.error(`❌ ERROR: PostgreSQL server at ${dbInfo.host}:${dbInfo.port} is unreachable.`);
    console.error('   Troubleshooting:');
    console.error('   1. If using Docker: ensure Docker Desktop is running and run `docker start tableflow-pg`');
    console.error('   2. If using local PostgreSQL: verify your PostgreSQL service is running on the configured port');
    console.error('   3. Run `npm run setup` for automatic database setup\n');
    process.exit(1);
  }

  console.log(`✓ Database server reachable at ${dbInfo.host}:${dbInfo.port}`);
}

await ensureDbReachable();

// --------------------------------------------------------------------
// 3. Database Existence & Auto-Creation
// --------------------------------------------------------------------
let prisma = new PrismaClient({ log: ['error'] });

async function ensureDatabaseExists() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes('does not exist') || msg.includes('3D000')) {
      console.log(`ℹ Database "${dbInfo.database}" does not exist. Creating it automatically...`);
      await prisma.$disconnect().catch(() => {});

      // Connect to default 'postgres' maintenance DB
      const maintenanceUrl = rawEnv.DATABASE_URL.replace(`/${dbInfo.database}`, '/postgres');
      const maintenancePrisma = new PrismaClient({
        datasources: { db: { url: maintenanceUrl } },
      });

      try {
        await maintenancePrisma.$connect();
        // Safe database identifier validation (letters, numbers, underscore only)
        if (!/^[a-zA-Z0-9_]+$/.test(dbInfo.database)) {
          throw new Error(`Unsafe database name: "${dbInfo.database}"`);
        }
        await maintenancePrisma.$executeRawUnsafe(`CREATE DATABASE "${dbInfo.database}"`);
        console.log(`✓ Database "${dbInfo.database}" created successfully.`);
      } catch (createErr) {
        console.error(`❌ ERROR: Failed to create database "${dbInfo.database}": ${createErr.message}`);
        process.exit(1);
      } finally {
        await maintenancePrisma.$disconnect().catch(() => {});
      }

      // Reconnect primary prisma client
      prisma = new PrismaClient({ log: ['error'] });
      await prisma.$connect();
    } else {
      console.error(`❌ ERROR connecting to database: ${msg}`);
      process.exit(1);
    }
  }
}

await ensureDatabaseExists();
console.log(`✓ Database "${dbInfo.database}" confirmed`);

// --------------------------------------------------------------------
// 4. Pending Migrations Check & Auto-Apply
// --------------------------------------------------------------------
async function ensureMigrations() {
  try {
    // Check if _prisma_migrations table exists and has rows
    const migrations = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `.catch(() => []);

    if (migrations.length === 0) {
      console.log('ℹ Pending migrations detected. Applying migrations with "prisma migrate deploy"...');
      const npxCmd = isWindows ? 'npx.cmd' : 'npx';
      execSync(`${npxCmd} prisma migrate deploy`, { stdio: 'inherit', cwd: rootDir });
      console.log('✓ Database migrations applied.');
    } else {
      console.log(`✓ Database schema up to date (${migrations.length} migration(s) applied)`);
    }
  } catch (err) {
    console.log('ℹ Checking migrations with prisma CLI...');
    try {
      const npxCmd = isWindows ? 'npx.cmd' : 'npx';
      execSync(`${npxCmd} prisma migrate deploy`, { stdio: 'inherit', cwd: rootDir });
      console.log('✓ Database migrations applied.');
    } catch (migErr) {
      console.error(`❌ ERROR applying migrations: ${migErr.message}`);
      process.exit(1);
    }
  }
}

await ensureMigrations();

// --------------------------------------------------------------------
// 5. Port 3000 Check
// --------------------------------------------------------------------
async function checkPort(port = 3000) {
  const isTaken = !(await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => {
      s.close(() => resolve(true));
    });
    s.listen(port, '127.0.0.1');
  }));

  if (isTaken) {
    let procInfo = 'unknown';
    try {
      if (isWindows) {
        const netstat = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
        const lines = netstat.trim().split(/\r?\n/);
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid) {
            const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).trim();
            procInfo = `PID ${pid} (${task.split(',')[0].replace(/"/g, '')})`;
          }
        }
      } else {
        const lsof = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim();
        procInfo = lsof ? `PID ${lsof}` : 'unknown';
      }
    } catch {
      // ignore PID inspection errors
    }

    console.warn(`⚠️  NOTICE: Port ${port} is currently in use by process: ${procInfo}.`);
    console.warn('   Next.js will automatically select the next available port (e.g. 3001) or attach to the active server.\n');
    return port + 1;
  }

  console.log(`✓ Port ${port} is free and ready`);
  return port;
}

const activePort = await checkPort(3000);

// --------------------------------------------------------------------
// 6. Fetch Sample Table & Print URLs
// --------------------------------------------------------------------
async function printStartupBanner(port) {
  let sampleTableToken = 'tbl_demo_01_a9f4c8b2e107456d';
  let sampleTableNum = 1;
  try {
    const sampleTable = await prisma.table.findFirst({
      where: { isActive: true },
      select: { tableNumber: true, qrToken: true },
      orderBy: { tableNumber: 'asc' },
    });
    if (sampleTable) {
      sampleTableToken = sampleTable.qrToken;
      sampleTableNum = sampleTable.tableNumber;
    }
  } catch {
    // fallback token
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  const base = `http://localhost:${port}`;
  console.log('======================================================================');
  console.log('             🍽  TABLEFLOW READY — ACCESS URLs                         ');
  console.log('======================================================================');
  console.log(`  📱 Guest Menu (Table ${sampleTableNum}):  ${base}/t/${sampleTableToken}`);
  console.log(`  👨‍🍳 Kitchen Display Screen:   ${base}/kitchen`);
  console.log(`  🗺  Staff Live Floor Map:      ${base}/staff/floor`);
  console.log(`  🛎  Waiter Calls Alert Board:  ${base}/staff/waiter-calls`);
  console.log(`  🛠  Admin Management Panel:    ${base}/admin`);
  console.log(`  🔑 Staff & Admin Sign In:     ${base}/login`);
  console.log(`  🩺 API Health Status:         ${base}/api/health`);
  console.log('----------------------------------------------------------------------');
  console.log('  Staff Credentials:');
  console.log('    - Owner:   owner@tableflow.local   | TableFlow@2026!Owner');
  console.log('    - Manager: manager@tableflow.local | TableFlow@2026!Manager');
  console.log('    - Waiter:  waiter@tableflow.local  | TableFlow@2026!Waiter');
  console.log('    - Chef:    chef@tableflow.local    | TableFlow@2026!Chef');
  console.log('======================================================================\n');
}

await printStartupBanner(activePort === 3001 ? 3001 : 3000);
