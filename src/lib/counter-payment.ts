import crypto from 'node:crypto';
import { prisma } from './prisma';
import { AppError } from './api-error';
import { recordAuditLog } from './audit';
import { computeSessionBillSummary } from './razorpay';
import { broadcastRealtime } from './realtime';
import { generateGapFreeGstInvoice } from './invoice';

export async function recordCounterPayment({
  tableSessionId,
  amountPaise,
  method,
  paymentReference,
  tipPaise = 0,
  actorUserId,
  actorRole,
}: {
  tableSessionId: number;
  amountPaise: number;
  method: 'cash' | 'counter_upi' | 'counter_card' | 'other';
  paymentReference?: string | null;
  tipPaise?: number;
  actorUserId: number;
  actorRole: string;
}) {
  const session = await prisma.tableSession.findUnique({
    where: { id: tableSessionId },
    include: { table: true },
  });

  if (!session) {
    throw new AppError(404, 'Table session not found.', 'SESSION_NOT_FOUND');
  }

  if (session.status !== 'active') {
    throw new AppError(
      400,
      `Cannot collect payment for a session with status "${session.status}".`,
      'SESSION_NOT_ACTIVE'
    );
  }

  const summary = await computeSessionBillSummary(tableSessionId);
  if (summary.remainingPaise <= 0) {
    throw new AppError(400, 'Bill is already fully paid.', 'ALREADY_PAID');
  }

  const safeTip = Math.max(0, Math.min(500000, Math.round(tipPaise || 0)));
  const totalPayable = amountPaise + safeTip;

  const internalOrderId = `COUNTER-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const internalPaymentId = paymentReference
    ? `REF-${paymentReference}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    : `REC-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create captured payment
    const payment = await tx.payment.create({
      data: {
        tableSessionId,
        razorpayOrderId: internalOrderId,
        razorpayPaymentId: internalPaymentId,
        amountPaise: totalPayable,
        tipPaise: safeTip,
        currency: 'INR',
        method,
        status: 'captured',
        paymentReference: paymentReference || null,
        recordedById: actorUserId,
      },
    });

    // 2. Compute if session is now fully paid
    const orders = await tx.order.findMany({
      where: { tableSessionId, status: { in: ['confirmed', 'preparing', 'ready', 'served'] } },
    });
    const allCaptured = await tx.payment.findMany({
      where: { tableSessionId, status: 'captured' },
    });

    const ordersTotal = orders.reduce((acc, o) => acc + o.totalPaise, 0);
    const paidWithoutTip = allCaptured.reduce(
      (acc, p) => acc + (p.amountPaise - (p.tipPaise || 0)),
      0
    );

    let sessionClosed = false;
    if (ordersTotal - paidWithoutTip <= 0) {
      await tx.tableSession.update({
        where: { id: tableSessionId },
        data: { status: 'paid', closedAt: new Date() },
      });

      const remainingActive = await tx.tableSession.count({
        where: { tableId: session.tableId, status: 'active', id: { not: session.id } },
      });
      if (remainingActive === 0) {
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: 'free' },
        });
      }
      sessionClosed = true;
    }

    // 3. Audit log
    await recordAuditLog({
      actorUserId,
      actorRole,
      action: 'COUNTER_PAYMENT_RECORDED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        tableSessionId,
        tableId: session.tableId,
        amountPaise: totalPayable,
        method,
        paymentReference,
        sessionClosed,
      },
      tx,
    });

    return { payment, sessionClosed };
  });

  // Generate tax invoice if session closed
  if (result.sessionClosed) {
    try {
      await generateGapFreeGstInvoice(tableSessionId);
    } catch (err) {
      console.error('[GST Invoice Generation Error]', err);
    }
  }

  // Realtime notification
  try {
    await Promise.all([
      broadcastRealtime(`table_session:${tableSessionId}`, 'payment:captured', {
        paymentId: result.payment.id,
        sessionClosed: result.sessionClosed,
      }),
      broadcastRealtime('staff:updates', 'payment:captured', {
        tableSessionId,
        sessionClosed: result.sessionClosed,
      }),
    ]);
  } catch {
    // Non-fatal
  }

  return result;
}

export async function confirmUpiPayment({
  paymentId,
  transactionReference,
  actorUserId,
  actorRole,
}: {
  paymentId: number;
  transactionReference?: string | null;
  actorUserId: number;
  actorRole: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { tableSession: { include: { table: true } } },
  });

  if (!payment) {
    throw new AppError(404, 'Payment record not found.', 'PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'captured') {
    return { payment, sessionClosed: false, alreadyCaptured: true };
  }

  if (payment.status !== 'created') {
    throw new AppError(
      400,
      `Cannot confirm payment with status "${payment.status}".`,
      'INVALID_PAYMENT_STATUS'
    );
  }

  const tableSessionId = payment.tableSessionId;
  const session = payment.tableSession;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Mark payment captured
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'captured',
        method: payment.method || 'upi_qr',
        paymentReference: transactionReference || payment.paymentReference || 'UPI_CONFIRMED',
        recordedById: actorUserId,
      },
    });

    if (payment.billSplitId) {
      await tx.billSplit.update({
        where: { id: payment.billSplitId },
        data: { status: 'paid' },
      });
    }

    // 2. Check if session is now fully paid
    const orders = await tx.order.findMany({
      where: { tableSessionId, status: { in: ['confirmed', 'preparing', 'ready', 'served'] } },
    });
    const allCaptured = await tx.payment.findMany({
      where: { tableSessionId, status: 'captured' },
    });

    const ordersTotal = orders.reduce((acc, o) => acc + o.totalPaise, 0);
    const paidWithoutTip = allCaptured.reduce(
      (acc, p) => acc + (p.amountPaise - (p.tipPaise || 0)),
      0
    );

    let sessionClosed = false;
    if (ordersTotal - paidWithoutTip <= 0) {
      await tx.tableSession.update({
        where: { id: tableSessionId },
        data: { status: 'paid', closedAt: new Date() },
      });

      const remainingActive = await tx.tableSession.count({
        where: { tableId: session.tableId, status: 'active', id: { not: session.id } },
      });
      if (remainingActive === 0) {
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: 'free' },
        });
      }
      sessionClosed = true;
    }

    // 3. Audit log
    await recordAuditLog({
      actorUserId,
      actorRole,
      action: 'PAYMENT_UPI_CONFIRMED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        tableSessionId,
        tableId: session.tableId,
        amountPaise: payment.amountPaise,
        transactionReference,
        sessionClosed,
      },
      tx,
    });

    return { payment: updatedPayment, sessionClosed };
  });

  // Generate tax invoice if session closed
  if (result.sessionClosed) {
    try {
      await generateGapFreeGstInvoice(tableSessionId);
    } catch (err) {
      console.error('[GST Invoice Generation Error]', err);
    }
  }

  // Realtime notification
  try {
    await Promise.all([
      broadcastRealtime(`table_session:${tableSessionId}`, 'payment:captured', {
        paymentId: result.payment.id,
        sessionClosed: result.sessionClosed,
      }),
      broadcastRealtime('staff:updates', 'payment:captured', {
        tableSessionId,
        sessionClosed: result.sessionClosed,
      }),
    ]);
  } catch {
    // Non-fatal
  }

  return result;
}
