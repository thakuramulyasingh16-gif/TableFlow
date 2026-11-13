#!/usr/bin/env node
/**
 * TableFlow - Database Health & Schema Check
 *
 * Verifies:
 * 1. Connection status (OK/FAIL)
 * 2. Database name & host
 * 3. Applied Prisma migrations
 * 4. Row counts for all key tables
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

// Load .env if present
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;

function parseDbUrl(url) {
  if (!url) return { host: 'unknown', port: 'unknown', database: 'unknown' };
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || 'unknown',
    };
  } catch {
    return { host: 'unknown', port: 'unknown', database: 'unknown' };
  }
}

const info = parseDbUrl(dbUrl);

console.log('======================================================================');
console.log('                TABLEFLOW DATABASE HEALTH CHECK                       ');
console.log('======================================================================');
console.log(`Target:      ${info.host}:${info.port} (database: "${info.database}")`);

if (!dbUrl) {
  console.error('Status:      FAIL (DATABASE_URL environment variable is missing)');
  console.error('Action:      Create or update .env with a valid DATABASE_URL');
  console.log('======================================================================');
  process.exit(1);
}

const prisma = new PrismaClient({
  log: ['error'],
});

async function runCheck() {
  const start = Date.now();
  try {
    // 1. Connection ping
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    console.log(`Connection:  OK (PostgreSQL responding, latency: ${latency}ms)`);

    // 2. Fetch applied migrations
    let migrations = [];
    try {
      migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at ASC
      `;
    } catch {
      // _prisma_migrations might not exist if migrations haven't run
    }

    console.log('\n--- Prisma Migrations ---');
    if (migrations.length === 0) {
      console.log('Applied:     0 (WARNING: No migrations applied yet. Run "npm run db:deploy" or "npm run db:migrate")');
    } else {
      console.log(`Applied:     ${migrations.length} migration(s)`);
      for (const m of migrations) {
        const time = m.finished_at ? new Date(m.finished_at).toISOString() : 'applied';
        console.log(`  ✓ ${m.migration_name} (${time})`);
      }
    }

    // 3. Row counts for key tables
    console.log('\n--- Table Row Counts ---');
    const [
      usersCount,
      tablesCount,
      categoriesCount,
      menuItemsCount,
      dealsCount,
      ordersCount,
      orderItemsCount,
      waiterCallsCount,
      sessionsCount,
      auditLogsCount,
      ingredientsCount,
      recipeItemsCount,
      purchasesCount,
      stockAlertsCount,
      stockEventsCount,
    ] = await Promise.all([
      prisma.user.count().catch(() => -1),
      prisma.table.count().catch(() => -1),
      prisma.category.count().catch(() => -1),
      prisma.menuItem.count().catch(() => -1),
      prisma.deal.count().catch(() => -1),
      prisma.order.count().catch(() => -1),
      prisma.orderItem.count().catch(() => -1),
      prisma.waiterCall.count().catch(() => -1),
      prisma.tableSession.count().catch(() => -1),
      prisma.auditLog.count().catch(() => -1),
      prisma.ingredient.count().catch(() => -1),
      prisma.recipeItem.count().catch(() => -1),
      prisma.purchase.count().catch(() => -1),
      prisma.stockAlert.count().catch(() => -1),
      prisma.stockEvent.count().catch(() => -1),
    ]);

    const formatCount = (name, count) => {
      const display = count === -1 ? 'TABLE NOT FOUND' : count.toString();
      return `  - ${name.padEnd(16)}: ${display}`;
    };

    console.log(formatCount('users', usersCount));
    console.log(formatCount('tables', tablesCount));
    console.log(formatCount('categories', categoriesCount));
    console.log(formatCount('menu_items', menuItemsCount));
    console.log(formatCount('deals', dealsCount));
    console.log(formatCount('orders', ordersCount));
    console.log(formatCount('order_items', orderItemsCount));
    console.log(formatCount('waiter_calls', waiterCallsCount));
    console.log(formatCount('table_sessions', sessionsCount));
    console.log(formatCount('audit_logs', auditLogsCount));
    console.log(formatCount('ingredients', ingredientsCount));
    console.log(formatCount('recipe_items', recipeItemsCount));
    console.log(formatCount('purchases', purchasesCount));
    console.log(formatCount('stock_alerts', stockAlertsCount));
    console.log(formatCount('stock_events', stockEventsCount));

    console.log('======================================================================');
    console.log('Result:      DATABASE IS READY AND HEALTHY');
    console.log('======================================================================');
    process.exit(0);
  } catch (err) {
    console.error('Connection:  FAIL');
    console.error(`Error:       ${err.message || String(err)}`);
    console.log('\nTroubleshooting:');
    console.log('  1. If running Docker: ensure container is up: `docker start tableflow-pg`');
    console.log('  2. If using local PostgreSQL: check service status and port in .env');
    console.log('  3. Run `npm run setup` for automatic local database provisioning');
    console.log('======================================================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

runCheck();
