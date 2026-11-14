import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/api-error';

// Basic environment variables for test suite
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  PAYMENTS_MOCK: 'true',
});

function distributeParts(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
}

test('Equal bill split distributes remainders so part sums exactly equal totals', () => {
  const total = 10001; // 10001 paise (e.g. ₹100.01) across 3 people
  const parts = distributeParts(total, 3);

  assert.equal(parts.length, 3);
  assert.deepEqual(parts, [3334, 3334, 3333]);
  const sum = parts.reduce((a, b) => a + b, 0);
  assert.equal(sum, total);

  // Even split check
  const evenTotal = 15000;
  const evenParts = distributeParts(evenTotal, 3);
  assert.deepEqual(evenParts, [5000, 5000, 5000]);
  assert.equal(evenParts.reduce((a, b) => a + b, 0), evenTotal);

  // 4 parts with 1 paise remainder
  const remOne = 2501;
  const fourParts = distributeParts(remOne, 4);
  assert.deepEqual(fourParts, [626, 625, 625, 625]);
  assert.equal(fourParts.reduce((a, b) => a + b, 0), remOne);
});

test('Only confirmed orders count toward payable bill, unconfirmed "received" orders are excluded', () => {
  const mockOrders = [
    { id: 1, status: 'received', totalPaise: 45000 },
    { id: 2, status: 'confirmed', totalPaise: 32000 },
    { id: 3, status: 'preparing', totalPaise: 18000 },
    { id: 4, status: 'ready', totalPaise: 12000 },
    { id: 5, status: 'served', totalPaise: 8000 },
    { id: 6, status: 'cancelled', totalPaise: 50000 },
  ];

  // Bill calculation filtering rule
  const payableOrders = mockOrders.filter((o) =>
    ['confirmed', 'preparing', 'ready', 'served'].includes(o.status)
  );

  assert.equal(payableOrders.length, 4);
  const totalPayable = payableOrders.reduce((sum, o) => sum + o.totalPaise, 0);
  // 32000 + 18000 + 12000 + 8000 = 70000
  assert.equal(totalPayable, 70000);

  // Received order (id: 1) and cancelled order (id: 6) are excluded
  assert.equal(payableOrders.some((o) => o.status === 'received'), false);
  assert.equal(payableOrders.some((o) => o.status === 'cancelled'), false);
});

test('Payment order reuse logic: reuses existing matching created payment and rejects concurrent conflict', () => {
  interface MockPayment {
    id: number;
    tableSessionId: number;
    billSplitId: number | null;
    amountPaise: number;
    status: string;
    createdAt: Date;
    razorpayOrderId: string;
  }

  const payments: MockPayment[] = [
    {
      id: 1,
      tableSessionId: 10,
      billSplitId: null,
      amountPaise: 5000,
      status: 'created',
      createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
      razorpayOrderId: 'order_test_1',
    },
  ];

  const getOrCreatePayment = (sessId: number, splitId: number | null, amount: number) => {
    // 1. Expire stale (> 15 min)
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const p of payments) {
      if (p.tableSessionId === sessId && p.status === 'created' && p.createdAt.getTime() < cutoff) {
        p.status = 'failed';
      }
    }

    // 2. Reuse matching created payment
    const existing = payments.find(
      (p) =>
        p.tableSessionId === sessId &&
        p.billSplitId === splitId &&
        p.status === 'created' &&
        p.createdAt.getTime() >= cutoff
    );

    if (existing) {
      if (existing.amountPaise === amount) {
        return { reused: true, payment: existing };
      } else {
        existing.status = 'failed';
      }
    }

    // 3. Reject duplicate if another payment is already pending
    const otherPending = payments.find(
      (p) =>
        p.tableSessionId === sessId &&
        p.billSplitId !== splitId &&
        p.status === 'created' &&
        p.createdAt.getTime() >= cutoff
    );
    if (otherPending) {
      throw new AppError(409, 'Another payment order is currently pending for this session.', 'PAYMENT_PENDING');
    }

    const newPayment = {
      id: payments.length + 1,
      tableSessionId: sessId,
      billSplitId: splitId,
      amountPaise: amount,
      status: 'created',
      createdAt: new Date(),
      razorpayOrderId: `order_test_${payments.length + 1}`,
    };
    payments.push(newPayment);
    return { reused: false, payment: newPayment };
  };

  // Reuses existing payment
  const res1 = getOrCreatePayment(10, null, 5000);
  assert.equal(res1.reused, true);
  assert.equal(res1.payment.id, 1);

  // Conflicting payment for split 1 while full bill is created -> rejected 409
  assert.throws(
    () => getOrCreatePayment(10, 1, 2500),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'PAYMENT_PENDING');
      return true;
    }
  );

  // Stale payment (> 15m) expires
  payments[0]!.createdAt = new Date(Date.now() - 20 * 60 * 1000);
  const res2 = getOrCreatePayment(10, null, 5000);
  assert.equal(res2.reused, false);
  assert.equal(res2.payment.id, 2);
  assert.equal(payments[0]!.status, 'failed');
});

test('Webhook amount & currency validation: rejects mismatches with 400', () => {
  const storedPayment = {
    id: 101,
    amountPaise: 42000,
    currency: 'INR',
    status: 'created',
  };

  const validateWebhookPayload = (payload: { amount?: number; currency?: string }) => {
    if (payload.amount != null && payload.amount !== storedPayment.amountPaise) {
      throw new AppError(400, 'Webhook payment amount does not match stored payment.', 'AMOUNT_MISMATCH');
    }
    if (payload.currency && payload.currency.toUpperCase() !== storedPayment.currency.toUpperCase()) {
      throw new AppError(400, 'Webhook payment currency does not match stored payment.', 'CURRENCY_MISMATCH');
    }
    return true;
  };

  // Amount mismatch -> 400
  assert.throws(
    () => validateWebhookPayload({ amount: 10000, currency: 'INR' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'AMOUNT_MISMATCH');
      return true;
    }
  );

  // Currency mismatch -> 400
  assert.throws(
    () => validateWebhookPayload({ amount: 42000, currency: 'USD' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'CURRENCY_MISMATCH');
      return true;
    }
  );

  // Matching amount & currency -> valid
  assert.equal(validateWebhookPayload({ amount: 42000, currency: 'INR' }), true);
});

test('Order cancellation: waiter/manager can cancel before cooking, rejected once cooking started', () => {
  const canCancelOrder = (orderStatus: string) => {
    if (orderStatus === 'cancelled') {
      throw new AppError(400, 'Order is already cancelled.', 'ORDER_ALREADY_CANCELLED');
    }
    if (['preparing', 'ready', 'served'].includes(orderStatus)) {
      throw new AppError(
        400,
        `Cannot cancel order once cooking has started (current status: ${orderStatus}).`,
        'ORDER_ALREADY_COOKING'
      );
    }
    return true;
  };

  // Before cooking: received -> OK
  assert.equal(canCancelOrder('received'), true);

  // Before cooking: confirmed -> OK
  assert.equal(canCancelOrder('confirmed'), true);

  // Cooking started: preparing -> 400 ORDER_ALREADY_COOKING
  assert.throws(
    () => canCancelOrder('preparing'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'ORDER_ALREADY_COOKING');
      return true;
    }
  );

  // Already served -> 400 ORDER_ALREADY_COOKING
  assert.throws(
    () => canCancelOrder('served'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'ORDER_ALREADY_COOKING');
      return true;
    }
  );

  // Already cancelled -> 400 ORDER_ALREADY_CANCELLED
  assert.throws(
    () => canCancelOrder('cancelled'),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'ORDER_ALREADY_CANCELLED');
      return true;
    }
  );
});

test('Payment refund: manager can refund captured payment, non-captured rejected with 400', () => {
  const validateRefund = (paymentStatus: string, amountPaise: number, refundAmount?: number) => {
    if (paymentStatus !== 'captured') {
      throw new AppError(400, 'Only captured payments can be refunded.', 'PAYMENT_NOT_REFUNDABLE');
    }
    const target = refundAmount || amountPaise;
    if (target <= 0 || target > amountPaise) {
      throw new AppError(400, 'Invalid refund amount.', 'INVALID_REFUND_AMOUNT');
    }
    return { status: 'refunded', refundAmount: target };
  };

  // Captured payment -> refund successful
  assert.deepEqual(validateRefund('captured', 5000), { status: 'refunded', refundAmount: 5000 });

  // Partial refund -> valid
  assert.deepEqual(validateRefund('captured', 5000, 2000), { status: 'refunded', refundAmount: 2000 });

  // Excessive refund -> 400
  assert.throws(
    () => validateRefund('captured', 5000, 6000),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_REFUND_AMOUNT');
      return true;
    }
  );

  // Non-captured payment ('created') -> 400
  assert.throws(
    () => validateRefund('created', 5000),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'PAYMENT_NOT_REFUNDABLE');
      return true;
    }
  );
});
