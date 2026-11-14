import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCounterPaymentSchema } from '../src/lib/validators';

test('Counter Payment: recordCounterPaymentSchema validates valid payment methods and amounts', () => {
  // Valid cash payment of ₹450 (45000 paise)
  const validCash = recordCounterPaymentSchema.safeParse({
    tableSessionId: 1,
    amountPaise: 45000,
    method: 'cash',
    paymentReference: 'Cash collected at table',
  });
  assert.equal(validCash.success, true);

  // Valid counter UPI payment with UTR reference
  const validUpi = recordCounterPaymentSchema.safeParse({
    tableSessionId: 2,
    amountPaise: 125000,
    method: 'counter_upi',
    paymentReference: 'UTR-332918239012',
    tipPaise: 5000,
  });
  assert.equal(validUpi.success, true);

  // Valid card payment via POS machine
  const validCard = recordCounterPaymentSchema.safeParse({
    tableSessionId: 3,
    amountPaise: 89000,
    method: 'counter_card',
    paymentReference: 'TXN-998822',
  });
  assert.equal(validCard.success, true);

  // Rejects zero or negative amount
  const zeroAmount = recordCounterPaymentSchema.safeParse({
    tableSessionId: 1,
    amountPaise: 0,
    method: 'cash',
  });
  assert.equal(zeroAmount.success, false);

  // Rejects invalid method
  const invalidMethod = recordCounterPaymentSchema.safeParse({
    tableSessionId: 1,
    amountPaise: 5000,
    method: 'crypto_currency',
  });
  assert.equal(invalidMethod.success, false);
});

test('Counter Payment: Session closure calculation logic', () => {
  function computeClosure({
    ordersTotal,
    previousPaid,
    newPaymentAmount,
  }: {
    ordersTotal: number;
    previousPaid: number;
    newPaymentAmount: number;
  }): { sessionClosed: boolean; remaining: number } {
    const totalPaid = previousPaid + newPaymentAmount;
    const remaining = Math.max(0, ordersTotal - totalPaid);
    return {
      sessionClosed: remaining === 0,
      remaining,
    };
  }

  // 1. Partial payment: bill ₹1000, paid ₹600 -> remains open
  const partial = computeClosure({
    ordersTotal: 100000,
    previousPaid: 0,
    newPaymentAmount: 60000,
  });
  assert.equal(partial.sessionClosed, false);
  assert.equal(partial.remaining, 40000);

  // 2. Full payment: remaining ₹400 paid -> closes session
  const full = computeClosure({
    ordersTotal: 100000,
    previousPaid: 60000,
    newPaymentAmount: 40000,
  });
  assert.equal(full.sessionClosed, true);
  assert.equal(full.remaining, 0);

  // 3. Exact full cash payment upfront -> closes session immediately
  const exact = computeClosure({
    ordersTotal: 75000,
    previousPaid: 0,
    newPaymentAmount: 75000,
  });
  assert.equal(exact.sessionClosed, true);
  assert.equal(exact.remaining, 0);
});
