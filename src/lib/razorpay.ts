import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { AppError } from './api-error';
import { recordAuditLog } from './audit';
import { verifyHmacSha256 } from './crypto';
import { getEnv } from './env';
import { prisma } from './prisma';
import { broadcastRealtime } from './realtime';

function getRazorpayClient() {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_ID.includes('replace_with')) {
    return null;
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export async function computeSessionBillSummary(tableSessionId: number) {
  const orders = await prisma.order.findMany({
    where: {
      tableSessionId,
      status: { not: 'cancelled' },
    },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });

  if (orders.length === 0) {
    return {
      orders: [],
      subtotalPaise: 0,
      discountPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      ordersTotalPaise: 0,
      paidPaise: 0,
      remainingPaise: 0,
      splits: [],
      payments: [],
    };
  }

  let subtotalPaise = 0;
  let discountPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let ordersTotalPaise = 0;

  for (const o of orders) {
    subtotalPaise += o.subtotalPaise;
    discountPaise += o.discountPaise;
    cgstPaise += o.cgstPaise;
    sgstPaise += o.sgstPaise;
    ordersTotalPaise += o.totalPaise;
  }

  const [payments, splits] = await Promise.all([
    prisma.payment.findMany({
      where: { tableSessionId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.billSplit.findMany({
      where: { tableSessionId },
      orderBy: { partNumber: 'asc' },
    }),
  ]);

  const paidPaise = payments
    .filter((p) => p.status === 'captured')
    .reduce((acc, p) => acc + Math.max(0, p.amountPaise - p.tipPaise), 0);

  return {
    orders,
    subtotalPaise,
    discountPaise,
    cgstPaise,
    sgstPaise,
    ordersTotalPaise,
    paidPaise,
    remainingPaise: Math.max(0, ordersTotalPaise - paidPaise),
    splits,
    payments,
  };
}

export async function createBillSplits({
  tableSessionId,
  splitType,
  parts = 2,
  itemIds = [],
}: {
  tableSessionId: number;
  splitType: 'full' | 'equal' | 'by_item';
  parts?: number;
  itemIds?: number[];
}) {
  const env = getEnv();
  const summary = await computeSessionBillSummary(tableSessionId);

  if (summary.remainingPaise <= 0) {
    throw new AppError(400, 'No remaining balance to split.', 'NOTHING_TO_PAY');
  }
  if (summary.splits.some((s) => s.status === 'paid')) {
    throw new AppError(409, 'Cannot modify splits after a partial payment is captured.', 'SPLIT_LOCKED');
  }

  return prisma.$transaction(async (tx) => {
    await tx.billSplit.deleteMany({ where: { tableSessionId, status: 'pending' } });

    if (splitType === 'equal') {
      const base = Math.floor(summary.remainingPaise / parts);
      const rem = summary.remainingPaise - base * parts;
      const rows = [];
      for (let i = 1; i <= parts; i++) {
        rows.push(
          await tx.billSplit.create({
            data: {
              tableSessionId,
              splitType: 'equal',
              partNumber: i,
              totalParts: parts,
              subtotalPaise: Math.round(summary.subtotalPaise / parts),
              discountPaise: Math.round(summary.discountPaise / parts),
              cgstPaise: Math.round(summary.cgstPaise / parts),
              sgstPaise: Math.round(summary.sgstPaise / parts),
              tipPaise: 0,
              amountPaise: base + (i === 1 ? rem : 0),
              status: 'pending',
            },
          })
        );
      }
      return rows;
    }

    if (splitType === 'by_item') {
      const sessionItems = summary.orders.flatMap((o) => o.items);
      const selectedSet = new Set(itemIds);
      const selected = sessionItems.filter((it) => selectedSet.has(it.id));
      if (selected.length === 0 || selected.length !== selectedSet.size) {
        throw new AppError(400, 'Selected items do not belong to your table session.', 'INVALID_SPLIT_ITEMS');
      }

      const selSub = selected.reduce((acc, it) => acc + it.lineTotalPaise, 0);
      const discRatio = summary.subtotalPaise > 0 ? summary.discountPaise / summary.subtotalPaise : 0;
      const selDisc = Math.round(selSub * discRatio);
      const taxable = Math.max(0, selSub - selDisc);
      const selCgst = Math.round((taxable * env.CGST_BPS) / 10000);
      const selSgst = Math.round((taxable * env.SGST_BPS) / 10000);
      const selTotal = taxable + selCgst + selSgst;
      const restTotal = Math.max(0, summary.remainingPaise - selTotal);

      const part1 = await tx.billSplit.create({
        data: {
          tableSessionId,
          splitType: 'by_item',
          partNumber: 1,
          totalParts: restTotal > 0 ? 2 : 1,
          subtotalPaise: selSub,
          discountPaise: selDisc,
          cgstPaise: selCgst,
          sgstPaise: selSgst,
          tipPaise: 0,
          amountPaise: selTotal,
          itemIdsJson: [...selectedSet],
          status: 'pending',
        },
      });

      if (restTotal <= 0) return [part1];

      const restIds = sessionItems.filter((it) => !selectedSet.has(it.id)).map((it) => it.id);
      const part2 = await tx.billSplit.create({
        data: {
          tableSessionId,
          splitType: 'by_item',
          partNumber: 2,
          totalParts: 2,
          subtotalPaise: Math.max(0, summary.subtotalPaise - selSub),
          discountPaise: Math.max(0, summary.discountPaise - selDisc),
          cgstPaise: Math.max(0, summary.cgstPaise - selCgst),
          sgstPaise: Math.max(0, summary.sgstPaise - selSgst),
          tipPaise: 0,
          amountPaise: restTotal,
          itemIdsJson: restIds,
          status: 'pending',
        },
      });
      return [part1, part2];
    }

    const full = await tx.billSplit.create({
      data: {
        tableSessionId,
        splitType: 'full',
        partNumber: 1,
        totalParts: 1,
        subtotalPaise: summary.subtotalPaise,
        discountPaise: summary.discountPaise,
        cgstPaise: summary.cgstPaise,
        sgstPaise: summary.sgstPaise,
        tipPaise: 0,
        amountPaise: summary.remainingPaise,
        status: 'pending',
      },
    });
    return [full];
  });
}

export async function createRazorpayOrderForSession({
  tableSessionId,
  tableId,
  tableNumber,
  billSplitId = null,
  tipPaise = 0,
}: {
  tableSessionId: number;
  tableId: number;
  tableNumber: string;
  billSplitId?: number | null;
  tipPaise?: number;
}) {
  const env = getEnv();
  const summary = await computeSessionBillSummary(tableSessionId);

  if (summary.remainingPaise <= 0) {
    throw new AppError(400, 'Bill is already fully paid.', 'ALREADY_PAID');
  }

  let baseAmount = summary.remainingPaise;
  let splitId: number | null = null;
  if (billSplitId != null) {
    const split = await prisma.billSplit.findFirst({
      where: { id: billSplitId, tableSessionId, status: 'pending' },
    });
    if (!split) {
      throw new AppError(404, 'Pending bill split not found for this session.', 'SPLIT_NOT_FOUND');
    }
    baseAmount = split.amountPaise;
    splitId = split.id;
  }

  const safeTip = Math.max(0, Math.min(500000, Math.round(tipPaise || 0)));
  const totalPayable = baseAmount + safeTip;

  const rzp = getRazorpayClient();
  let razorpayOrderId: string;
  let isMock = false;

  if (rzp) {
    const rzpOrder = await rzp.orders.create({
      amount: totalPayable,
      currency: 'INR',
      receipt: `tf_sess_${tableSessionId}_${Date.now()}`,
      notes: { table_number: tableNumber, table_session_id: String(tableSessionId) },
    });
    razorpayOrderId = rzpOrder.id;
  } else {
    if (env.isProd) {
      throw new AppError(500, 'Payment gateway is not configured.', 'PAYMENT_CONFIG_ERROR');
    }
    razorpayOrderId = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
    isMock = true;
  }

  const payment = await prisma.payment.create({
    data: {
      tableSessionId,
      billSplitId: splitId,
      razorpayOrderId,
      amountPaise: totalPayable,
      tipPaise: safeTip,
      currency: 'INR',
      status: 'created',
    },
  });

  await prisma.table.update({
    where: { id: tableId },
    data: { status: 'bill_requested' },
  });

  await broadcastRealtime('staff:updates', 'table:status_changed', {
    id: tableId,
    tableNumber,
    status: 'bill_requested',
  });

  return {
    paymentId: payment.id,
    razorpayOrderId,
    amountPaise: totalPayable,
    currency: 'INR',
    keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || 'rzp_test_mock_mode',
    isMock,
  };
}

export async function verifyAndCapturePayment({
  tableSessionId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  method = 'upi',
}: {
  tableSessionId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method?: string;
}) {
  const env = getEnv();
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId, tableSessionId },
  });
  if (!payment) {
    throw new AppError(404, 'Payment order not found for this table session.', 'PAYMENT_NOT_FOUND');
  }
  if (payment.status === 'captured') {
    return { payment, sessionClosed: false };
  }

  const secret =
    env.RAZORPAY_KEY_SECRET && !env.RAZORPAY_KEY_SECRET.includes('replace_with')
      ? env.RAZORPAY_KEY_SECRET
      : !env.isProd
      ? 'test_mock_secret'
      : '';

  const valid = verifyHmacSha256(`${razorpayOrderId}|${razorpayPaymentId}`, secret, razorpaySignature);
  if (!valid) {
    await recordAuditLog({
      action: 'PAYMENT_SIGNATURE_FAILED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { razorpayOrderId, razorpayPaymentId },
    });
    throw new AppError(400, 'Payment signature verification failed.', 'INVALID_PAYMENT_SIGNATURE');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        razorpayPaymentId,
        status: 'captured',
        method,
      },
    });

    if (payment.billSplitId) {
      await tx.billSplit.update({
        where: { id: payment.billSplitId },
        data: { status: 'paid', tipPaise: payment.tipPaise },
      });
    }

    await recordAuditLog({
      action: 'PAYMENT_CAPTURED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { amountPaise: payment.amountPaise, method },
      tx,
    });

    const allOrders = await tx.order.findMany({
      where: { tableSessionId, status: { not: 'cancelled' } },
    });
    const ordersTotal = allOrders.reduce((acc, o) => acc + o.totalPaise, 0);
    const capturedPayments = await tx.payment.findMany({
      where: { tableSessionId, status: 'captured' },
    });
    const paidWithoutTip = capturedPayments.reduce(
      (acc, p) => acc + Math.max(0, p.amountPaise - p.tipPaise),
      0
    );

    let sessionClosed = false;
    if (ordersTotal - paidWithoutTip <= 0) {
      const sess = await tx.tableSession.findUnique({ where: { id: tableSessionId } });
      if (sess && sess.status === 'active') {
        await tx.tableSession.update({
          where: { id: tableSessionId },
          data: { status: 'paid', closedAt: new Date() },
        });
        await tx.table.update({
          where: { id: sess.tableId },
          data: { status: 'free' },
        });
        sessionClosed = true;
      }
    }

    return { payment: updatedPayment, sessionClosed };
  });

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

  return result;
}

export async function processRazorpayWebhook({
  rawBody,
  signature,
  eventIdHeader,
}: {
  rawBody: string;
  signature: string;
  eventIdHeader?: string;
}) {
  const env = getEnv();
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError(500, 'Webhook secret not configured.', 'WEBHOOK_NOT_CONFIGURED');
  }

  if (!verifyHmacSha256(rawBody, env.RAZORPAY_WEBHOOK_SECRET, signature)) {
    throw new AppError(400, 'Invalid webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
  }

  const event = JSON.parse(rawBody) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string } } };
  };
  const eventId = eventIdHeader || crypto.createHash('sha256').update(rawBody).digest('hex');

  const already = await prisma.payment.findUnique({ where: { webhookEventId: eventId } });
  if (already) return { status: 'already_processed' };

  if (event.event === 'payment.captured') {
    const entity = event.payload?.payment?.entity;
    const rzpOrderId = entity?.order_id;
    const rzpPaymentId = entity?.id;
    if (!rzpOrderId || !rzpPaymentId) return { status: 'ignored' };

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: rzpOrderId } });
    if (!payment) return { status: 'order_not_found' };

    await prisma.$transaction(async (tx) => {
      if (payment.status !== 'captured') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            razorpayPaymentId: rzpPaymentId,
            status: 'captured',
            method: entity?.method || payment.method || 'upi',
            webhookEventId: eventId,
          },
        });
        if (payment.billSplitId) {
          await tx.billSplit.update({ where: { id: payment.billSplitId }, data: { status: 'paid' } });
        }

        const orders = await tx.order.findMany({
          where: { tableSessionId: payment.tableSessionId, status: { not: 'cancelled' } },
        });
        const ordersTotal = orders.reduce((acc, o) => acc + o.totalPaise, 0);
        const captured = await tx.payment.findMany({
          where: { tableSessionId: payment.tableSessionId, status: 'captured' },
        });
        const paid = captured.reduce((acc, p) => acc + Math.max(0, p.amountPaise - p.tipPaise), 0);
        if (ordersTotal - paid <= 0) {
          const sess = await tx.tableSession.findUnique({ where: { id: payment.tableSessionId } });
          if (sess && sess.status === 'active') {
            await tx.tableSession.update({
              where: { id: sess.id },
              data: { status: 'paid', closedAt: new Date() },
            });
            await tx.table.update({ where: { id: sess.tableId }, data: { status: 'free' } });
          }
        }
      } else {
        await tx.payment.update({ where: { id: payment.id }, data: { webhookEventId: eventId } });
      }
    });

    await broadcastRealtime(`table_session:${payment.tableSessionId}`, 'payment:captured', {
      paymentId: payment.id,
    });
  }

  return { status: 'processed' };
}
