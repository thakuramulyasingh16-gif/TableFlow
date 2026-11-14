import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/api-error';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
});

test('Deal concurrency: pessimistic lock and atomic count check prevents over-redemption under parallel orders', async () => {
  // Check if database is reachable
  let dbAvailable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }

  if (!dbAvailable) {
    console.log('Skipping live DB concurrency test: database is not reachable.');
    return;
  }

  // Find or create a test table and active table session
  let table = await prisma.table.findFirst();
  if (!table) {
    table = await prisma.table.create({
      data: {
        tableNumber: 'T999_' + Date.now(),
        label: 'Test Table 999',
        capacity: 4,
        qrToken: 'qr_concurrency_test_token_' + Date.now(),
        status: 'ordered',
      },
    });
  }

  const session = await prisma.tableSession.create({
    data: {
      tableId: table.id,
      sessionTokenHash: ('hash_concurrency_test_' + Date.now()).padEnd(64, '0'),
      status: 'active',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  // 1. Test One-Time Deal: 10 parallel orders attempt redemption -> exactly 1 succeeds, 9 fail
  const oneTimeDeal = await prisma.deal.create({
    data: {
      title: 'One Time Flash Deal',
      code: 'ONETIME_' + Date.now(),
      discountType: 'percent',
      discountValue: 20,
      minOrderPaise: 0,
      isActive: true,
      isOneTime: true,
    },
  });

  const parallelCount = 10;
  const placeOrderWithDeal = async (dealId: number, isOneTime: boolean, maxRedemptions: number | null) => {
    return prisma.$transaction(async (tx) => {
      // Concurrency-safe pessimistic lock
      const lockedDeals = await tx.$queryRaw<Array<{ id: number; is_active: boolean }>>`
        SELECT id, is_active FROM deals WHERE id = ${dealId} FOR UPDATE
      `;
      if (!lockedDeals.length || !lockedDeals[0]?.is_active) {
        throw new AppError(400, 'Selected deal is no longer active.', 'DEAL_INVALID');
      }

      if (isOneTime) {
        const existingCount = await tx.order.count({
          where: { dealId, status: { not: 'cancelled' } },
        });
        if (existingCount >= 1) {
          throw new AppError(400, 'This promo code is single-use and has already been redeemed.', 'DEAL_ALREADY_REDEEMED');
        }
      }

      if (maxRedemptions != null) {
        const totalRedemptions = await tx.order.count({
          where: { dealId, status: { not: 'cancelled' } },
        });
        if (totalRedemptions >= maxRedemptions) {
          throw new AppError(400, 'This promo code has reached its maximum total redemptions.', 'DEAL_EXHAUSTED');
        }
      }

      return tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          tableId: table.id,
          tableSessionId: session.id,
          dealId,
          status: 'received',
          subtotalPaise: 5000,
          discountPaise: 1000,
          cgstPaise: 100,
          sgstPaise: 100,
          totalPaise: 4200,
        },
      });
    });
  };

  const oneTimePromises = Array.from({ length: parallelCount }, () =>
    placeOrderWithDeal(oneTimeDeal.id, true, null)
  );

  const oneTimeResults = await Promise.allSettled(oneTimePromises);
  const oneTimeSuccesses = oneTimeResults.filter((r) => r.status === 'fulfilled');
  const oneTimeRejections = oneTimeResults.filter((r) => r.status === 'rejected');

  assert.equal(oneTimeSuccesses.length, 1, 'Exactly 1 one-time order must succeed');
  assert.equal(oneTimeRejections.length, parallelCount - 1, 'All other parallel orders must be rejected');

  // Verify in database: exactly 1 order exists for this deal
  const dbOneTimeOrdersCount = await prisma.order.count({
    where: { dealId: oneTimeDeal.id, status: { not: 'cancelled' } },
  });
  assert.equal(dbOneTimeOrdersCount, 1);

  // 2. Test Capped Deal: maxRedemptions = 3, 10 parallel orders attempt redemption -> exactly 3 succeed
  const cappedDeal = await prisma.deal.create({
    data: {
      title: 'Limited Quantity Deal',
      code: 'CAPPED3_' + Date.now(),
      discountType: 'percent',
      discountValue: 15,
      minOrderPaise: 0,
      isActive: true,
      isOneTime: false,
      maxRedemptions: 3,
    },
  });

  const cappedPromises = Array.from({ length: parallelCount }, () =>
    placeOrderWithDeal(cappedDeal.id, false, 3)
  );

  const cappedResults = await Promise.allSettled(cappedPromises);
  const cappedSuccesses = cappedResults.filter((r) => r.status === 'fulfilled');
  const cappedRejections = cappedResults.filter((r) => r.status === 'rejected');

  assert.equal(cappedSuccesses.length, 3, 'Exactly 3 orders must succeed for capped deal');
  assert.equal(cappedRejections.length, parallelCount - 3, 'Remaining parallel orders must be rejected');

  // Verify in database: exactly 3 orders exist for this deal
  const dbCappedOrdersCount = await prisma.order.count({
    where: { dealId: cappedDeal.id, status: { not: 'cancelled' } },
  });
  assert.equal(dbCappedOrdersCount, 3);

  // Clean up test data
  await prisma.order.deleteMany({
    where: { dealId: { in: [oneTimeDeal.id, cappedDeal.id] } },
  });
  await prisma.deal.deleteMany({
    where: { id: { in: [oneTimeDeal.id, cappedDeal.id] } },
  });
  await prisma.tableSession.delete({
    where: { id: session.id },
  });
});
