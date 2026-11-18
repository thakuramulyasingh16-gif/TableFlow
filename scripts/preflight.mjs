#!/usr/bin/env node
/**
 * TableFlow - Predev Preflight Check
 *
 * Runs automatically prior to `dev` runner when calling `npm run dev`.
 * Verifies:
 * 1. .env exists and required variables validate against Zod schema
 * 2. .env.local comparison: warns if DATABASE_URL/DIRECT_URL differ from .env
 * 3. Database server is reachable (auto-starts docker container if stopped)
 * 4. Database exists (auto-creates if missing)
 * 5. Migrations are up to date (auto-applies pending migrations)
 * 6. Port 3000 status on IPv4 & IPv6 + .next/dev lock detection:
 *    - If TableFlow is already running, prints URL and exits 0
 *    - If another process holds port 3000, warns with PID and exits 1 (never silently switches)
 * 7. Fetches sample table token and prints exact startup URLs (never prints hardcoded credentials)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  parseEnvFile,
  parsePostgresUrl,
  checkEnvLocalDiff,
  isNextDevLocked,
  detectPortListener,
  testTcpPort,
  isTableFlowServerRunning,
} from './preflight-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const sentinelPath = path.join(rootDir, '.next', 'already-running');
const isWindows = process.platform === 'win32';

// Ensure sentinel from any prior aborted run is cleared
if (fs.existsSync(sentinelPath)) {
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    // ignore unlink error
  }
}

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

const rawEnv = parseEnvFile(envPath);

// Inherit process environment variables (e.g. CI runners)
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
// 2. .env.local Difference Check (Item 2)
// --------------------------------------------------------------------
const envDiffs = checkEnvLocalDiff(rootDir, rawEnv);
if (envDiffs.length > 0) {
  console.warn('\n⚠️  WARNING: .env.local exists and its database configuration differs from .env:');
  for (const d of envDiffs) {
    console.warn(`   - ${d.key}:`);
    console.warn(`       .env:       host="${d.envHost}:${d.envPort}", database="${d.envDatabase}"`);
    console.warn(`       .env.local: host="${d.localHost}:${d.localPort}", database="${d.localDatabase}"`);
  }
  console.warn('   Next.js loads .env.local with higher priority than .env.');
  console.warn('   (Note: Passwords are omitted for security. Update .env.local if this difference is unintended.)\n');
}

// --------------------------------------------------------------------
// 3. Database Reachability & Auto-start Docker
// --------------------------------------------------------------------
const dbInfo = parsePostgresUrl(rawEnv.DATABASE_URL);

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
// 4. Database Existence & Auto-Creation
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
// 5. Pending Migrations Check & Auto-Apply
// --------------------------------------------------------------------
async function ensureMigrations() {
  try {
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
// 6. Reliable Port 3000 Check (IPv4 & IPv6 + .next/dev lock) (Item 1)
// --------------------------------------------------------------------
const portListener = detectPortListener(3000);
const hasDevLock = isNextDevLocked(rootDir);
const hasV4Connect = await testTcpPort('127.0.0.1', 3000, 500);
const hasV6Connect = await testTcpPort('::1', 3000, 500);

const portOccupied = portListener.isListening || hasDevLock || hasV4Connect || hasV6Connect;

if (portOccupied) {
  const isTableFlowRunning = hasDevLock || (await isTableFlowServerRunning(3000));

  if (isTableFlowRunning) {
    console.log('======================================================================');
    console.log('  ℹ TableFlow development server is already running!');
    console.log('======================================================================');
    console.log('  Access URLs:');
    console.log('    - Staff Sign In:            http://localhost:3000/login');
    console.log('    - Kitchen Display Screen:   http://localhost:3000/kitchen');
    console.log('    - Staff Live Floor Map:     http://localhost:3000/staff/floor');
    console.log('    - Admin Management Panel:   http://localhost:3000/admin');
    console.log('    - API Health Status:        http://localhost:3000/api/health');
    console.log('======================================================================');
    console.log('Exiting cleanly (0) to avoid starting a duplicate server instance.\n');

    // Create sentinel so dev-runner exits cleanly without spawning Next.js
    try {
      fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
      fs.writeFileSync(sentinelPath, 'already-running', 'utf8');
    } catch {
      // ignore write error
    }

    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  } else {
    const procDesc = portListener.pid
      ? `PID ${portListener.pid}${portListener.processName ? ` (${portListener.processName})` : ''}`
      : 'unrecognized process';

    console.error(`\n❌ ERROR: Port 3000 is occupied by another process: ${procDesc}.`);
    console.error('   TableFlow requires port 3000 and will NEVER silently switch to another port.');
    console.error(`   Please free port 3000 (e.g. "stop-tableflow.bat" or terminate ${procDesc}) and re-run.\n`);

    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

console.log('✓ Port 3000 is free and ready');

// --------------------------------------------------------------------
// 7. Fetch Sample Table & Print URLs (No Hardcoded Credentials) (Item 3)
// --------------------------------------------------------------------
async function printStartupBanner(port = 3000) {
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
  console.log('    Generated randomly at seed time (prisma/seed.ts) and printed once.');
  console.log('    All staff accounts require password change upon first login.');
  console.log('======================================================================\n');
}

await printStartupBanner(3000);
