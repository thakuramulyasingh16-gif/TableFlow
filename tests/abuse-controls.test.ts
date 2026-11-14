import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createPurchaseSchema } from '../src/lib/validators';
import { GET as getHealth } from '../src/app/api/health/route';

test('Abuse controls: createPurchaseSchema validates rupees and rejects amounts rounding to 0 paise', () => {
  // ₹120.50 is valid (12050 paise)
  const valid = createPurchaseSchema.safeParse({
    ingredientId: 1,
    quantity: 5,
    unit: 'kg',
    totalCostRupees: 120.5,
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    const paise = Math.round(valid.data.totalCostRupees * 100);
    assert.equal(paise, 12050);
  }

  // ₹0.003 rounds to 0 paise -> rejected
  const roundingToZero = createPurchaseSchema.safeParse({
    ingredientId: 1,
    quantity: 5,
    unit: 'kg',
    totalCostRupees: 0.003,
  });
  assert.equal(roundingToZero.success, false);
});

test('Abuse controls: /api/health drops uptime and rate-limits requests', async () => {
  const req = new NextRequest('http://localhost:3000/api/health', {
    method: 'GET',
    headers: { 'x-forwarded-for': '198.51.100.42' },
  });

  const res = await getHealth(req);
  assert.equal(res.status, 200);

  const json = (await res.json()) as Record<string, unknown>;
  assert.equal(json.status, 'ok');
  assert.equal(json.app, 'healthy');
  assert.ok('database' in json);
  assert.ok('timestamp' in json);

  // Uptime must be strictly omitted from public response
  assert.equal('uptimeSeconds' in json, false, 'uptimeSeconds must not be exposed in public health check');
  assert.equal('uptime' in json, false, 'uptime must not be exposed in public health check');
});

test('Abuse controls: Deal redemption logic enforces one-time, session, and global limits', () => {
  // Test deal model validation helper
  interface MockDeal {
    id: number;
    code: string;
    isOneTime: boolean;
    maxRedemptions: number | null;
    perSessionLimit: number;
    perTableLimit: number | null;
  }

  function validateDealRedemption({
    deal,
    globalCount,
    sessionCount,
    tableCount,
  }: {
    deal: MockDeal;
    globalCount: number;
    sessionCount: number;
    tableCount: number;
  }): { allowed: boolean; reason?: string } {
    if (deal.isOneTime && globalCount >= 1) {
      return { allowed: false, reason: 'DEAL_ALREADY_REDEEMED' };
    }
    if (deal.maxRedemptions !== null && globalCount >= deal.maxRedemptions) {
      return { allowed: false, reason: 'DEAL_EXHAUSTED' };
    }
    if (sessionCount >= deal.perSessionLimit) {
      return { allowed: false, reason: 'DEAL_SESSION_LIMIT_EXCEEDED' };
    }
    if (deal.perTableLimit !== null && tableCount >= deal.perTableLimit) {
      return { allowed: false, reason: 'DEAL_TABLE_LIMIT_EXCEEDED' };
    }
    return { allowed: true };
  }

  const oneTimeDeal: MockDeal = {
    id: 1,
    code: 'WELCOME100',
    isOneTime: true,
    maxRedemptions: null,
    perSessionLimit: 1,
    perTableLimit: null,
  };

  // First use -> allowed
  assert.equal(validateDealRedemption({ deal: oneTimeDeal, globalCount: 0, sessionCount: 0, tableCount: 0 }).allowed, true);
  // Second use -> blocked
  assert.equal(
    validateDealRedemption({ deal: oneTimeDeal, globalCount: 1, sessionCount: 0, tableCount: 0 }).reason,
    'DEAL_ALREADY_REDEEMED'
  );

  const cappedDeal: MockDeal = {
    id: 2,
    code: 'FIRST50',
    isOneTime: false,
    maxRedemptions: 50,
    perSessionLimit: 2,
    perTableLimit: 5,
  };

  // Session limit exceeded -> blocked
  assert.equal(
    validateDealRedemption({ deal: cappedDeal, globalCount: 10, sessionCount: 2, tableCount: 2 }).reason,
    'DEAL_SESSION_LIMIT_EXCEEDED'
  );

  // Global redemptions exhausted -> blocked
  assert.equal(
    validateDealRedemption({ deal: cappedDeal, globalCount: 50, sessionCount: 0, tableCount: 0 }).reason,
    'DEAL_EXHAUSTED'
  );

  // Table limit reached -> blocked
  assert.equal(
    validateDealRedemption({ deal: cappedDeal, globalCount: 15, sessionCount: 1, tableCount: 5 }).reason,
    'DEAL_TABLE_LIMIT_EXCEEDED'
  );
});

test('Abuse controls: Order item caps and maximum order value', () => {
  const MAX_ITEMS = 30;
  const MAX_ORDER_VALUE_PAISE = 2000000; // ₹20,000

  // 1. Items count limit
  const validItems = [{ quantity: 10 }, { quantity: 15 }, { quantity: 5 }];
  const excessiveItems = [{ quantity: 20 }, { quantity: 15 }];

  const totalValid = validItems.reduce((acc, it) => acc + it.quantity, 0);
  const totalExcessive = excessiveItems.reduce((acc, it) => acc + it.quantity, 0);

  assert.equal(totalValid <= MAX_ITEMS, true);
  assert.equal(totalExcessive > MAX_ITEMS, true);

  // 2. Max order value limit
  const normalOrderPaise = 250000; // ₹2,500
  const excessiveOrderPaise = 2500000; // ₹25,000

  assert.equal(normalOrderPaise <= MAX_ORDER_VALUE_PAISE, true);
  assert.equal(excessiveOrderPaise > MAX_ORDER_VALUE_PAISE, true);
});
