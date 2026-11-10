import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { Op } from 'sequelize';
import { getEnv } from '../config/env.js';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';
import { verifyHmacSha256 } from '../utils/crypto.js';
import { recordAuditLog } from './auditService.js';

function getRazorpayClient(env = getEnv()) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_ID.includes('replace_with')) {
    return null;
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export async function computeSessionBillSummary(tableSessionId) {
  const { Order, OrderItem, Payment, BillSplit } = getModels();
  const orders = await Order.findAll({
    where: {
      table_session_id: tableSessionId,
      status: { [Op.ne]: 'cancelled' },
    },
    include: [{ model: OrderItem, as: 'items' }],
    order: [['created_at', 'ASC']],
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
    subtotalPaise += o.subtotal_paise;
    discountPaise += o.discount_paise;
    cgstPaise += o.cgst_paise;
    sgstPaise += o.sgst_paise;
    ordersTotalPaise += o.total_paise;
  }

  const payments = await Payment.findAll({
    where: { table_session_id: tableSessionId },
    order: [['created_at', 'DESC']],
  });

  const paidWithoutTipsPaise = payments
    .filter((p) => p.status === 'captured')
    .reduce((acc, p) => acc + Math.max(0, p.amount_paise - p.tip_paise), 0);

  const splits = await BillSplit.findAll({
    where: { table_session_id: tableSessionId },
    order: [['part_number', 'ASC']],
  });

  return {
    orders,
    subtotalPaise,
    discountPaise,
    cgstPaise,
    sgstPaise,
    ordersTotalPaise,
    paidPaise: paidWithoutTipsPaise,
    remainingPaise: Math.max(0, ordersTotalPaise - paidWithoutTipsPaise),
    splits,
    payments,
  };
}

export async function createBillSplits({ tableSessionId, splitType, parts = 2, itemIds = [] }) {
  const { BillSplit, sequelize } = getModels();
  const env = getEnv();
  const summary = await computeSessionBillSummary(tableSessionId);

  if (summary.remainingPaise <= 0) {
    throw new AppError(400, 'No remaining balance to split.', 'NOTHING_TO_PAY');
  }

  const paidSplitExists = summary.splits.some((s) => s.status === 'paid');
  if (paidSplitExists) {
    throw new AppError(409, 'Cannot regenerate splits after a partial payment has been captured.', 'SPLIT_LOCKED');
  }

  return sequelize.transaction(async (transaction) => {
    await BillSplit.destroy({ where: { table_session_id: tableSessionId, status: 'pending' }, transaction });

    if (splitType === 'equal') {
      const baseAmount = Math.floor(summary.remainingPaise / parts);
      const remainder = summary.remainingPaise - baseAmount * parts;
      const created = [];
      for (let i = 1; i <= parts; i++) {
        const partAmount = baseAmount + (i === 1 ? remainder : 0);
        const row = await BillSplit.create(
          {
            table_session_id: tableSessionId,
            split_type: 'equal',
            part_number: i,
            total_parts: parts,
            subtotal_paise: Math.round(summary.subtotalPaise / parts),
            discount_paise: Math.round(summary.discountPaise / parts),
            cgst_paise: Math.round(summary.cgstPaise / parts),
            sgst_paise: Math.round(summary.sgstPaise / parts),
            tip_paise: 0,
            amount_paise: partAmount,
            status: 'pending',
          },
          { transaction }
        );
        created.push(row);
      }
      return created;
    }

    if (splitType === 'by_item') {
      const sessionItems = summary.orders.flatMap((o) => o.items || []);
      const selectedSet = new Set(itemIds);
      const selectedItems = sessionItems.filter((it) => selectedSet.has(it.id));

      if (selectedItems.length === 0 || selectedItems.length !== selectedSet.size) {
        throw new AppError(400, 'Selected items do not belong to your table session.', 'INVALID_SPLIT_ITEMS');
      }

      const selectedSub = selectedItems.reduce((acc, it) => acc + it.line_total_paise, 0);
      const discountRatio = summary.subtotalPaise > 0 ? summary.discountPaise / summary.subtotalPaise : 0;
      const selDiscount = Math.round(selectedSub * discountRatio);
      const taxable = Math.max(0, selectedSub - selDiscount);
      const selCgst = Math.round((taxable * env.CGST_BPS) / 10000);
      const selSgst = Math.round((taxable * env.SGST_BPS) / 10000);
      const selTotal = taxable + selCgst + selSgst;

      const remainingPart = Math.max(0, summary.remainingPaise - selTotal);

      const part1 = await BillSplit.create(
        {
          table_session_id: tableSessionId,
          split_type: 'by_item',
          part_number: 1,
          total_parts: remainingPart > 0 ? 2 : 1,
          subtotal_paise: selectedSub,
          discount_paise: selDiscount,
          cgst_paise: selCgst,
          sgst_paise: selSgst,
          tip_paise: 0,
          amount_paise: selTotal,
          item_ids_json: [...selectedSet],
          status: 'pending',
        },
        { transaction }
      );

      if (remainingPart <= 0) return [part1];

      const restIds = sessionItems.filter((it) => !selectedSet.has(it.id)).map((it) => it.id);
      const part2 = await BillSplit.create(
        {
          table_session_id: tableSessionId,
          split_type: 'by_item',
          part_number: 2,
          total_parts: 2,
          subtotal_paise: Math.max(0, summary.subtotalPaise - selectedSub),
          discount_paise: Math.max(0, summary.discountPaise - selDiscount),
          cgst_paise: Math.max(0, summary.cgstPaise - selCgst),
          sgst_paise: Math.max(0, summary.sgstPaise - selSgst),
          tip_paise: 0,
          amount_paise: remainingPart,
          item_ids_json: restIds,
          status: 'pending',
        },
        { transaction }
      );
      return [part1, part2];
    }

    const full = await BillSplit.create(
      {
        table_session_id: tableSessionId,
        split_type: 'full',
        part_number: 1,
        total_parts: 1,
        subtotal_paise: summary.subtotalPaise,
        discount_paise: summary.discountPaise,
        cgst_paise: summary.cgstPaise,
        sgst_paise: summary.sgstPaise,
        tip_paise: 0,
        amount_paise: summary.remainingPaise,
        status: 'pending',
      },
      { transaction }
    );
    return [full];
  });
}

export async function createRazorpayOrderForSession({ tableSession, table, billSplitId = null, tipPaise = 0 }) {
  const { BillSplit, Payment, Table } = getModels();
  const env = getEnv();
  const summary = await computeSessionBillSummary(tableSession.id);

  if (summary.remainingPaise <= 0) {
    throw new AppError(400, 'Bill is already fully paid.', 'ALREADY_PAID');
  }

  let baseAmountPaise = summary.remainingPaise;
  let splitRecord = null;
  if (billSplitId != null) {
    splitRecord = await BillSplit.findOne({
      where: { id: billSplitId, table_session_id: tableSession.id, status: 'pending' },
    });
    if (!splitRecord) {
      throw new AppError(404, 'Pending bill split not found for this table session.', 'SPLIT_NOT_FOUND');
    }
    baseAmountPaise = splitRecord.amount_paise;
  }

  const safeTipPaise = Math.max(0, Math.min(500000, Math.round(tipPaise || 0)));
  const totalPayablePaise = baseAmountPaise + safeTipPaise;

  const rzp = getRazorpayClient(env);
  let rzpOrderId;
  let isMock = false;

  if (rzp) {
    const rzpOrder = await rzp.orders.create({
      amount: totalPayablePaise,
      currency: 'INR',
      receipt: `tf_sess_${tableSession.id}_${Date.now()}`,
      notes: {
        table_number: table.table_number,
        table_session_id: String(tableSession.id),
      },
    });
    rzpOrderId = rzpOrder.id;
  } else {
    if (env.isProd) {
      throw new AppError(500, 'Payment gateway is not configured.', 'PAYMENT_CONFIG_ERROR');
    }
    rzpOrderId = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
    isMock = true;
  }

  const payment = await Payment.create({
    table_session_id: tableSession.id,
    bill_split_id: splitRecord ? splitRecord.id : null,
    razorpay_order_id: rzpOrderId,
    amount_paise: totalPayablePaise,
    tip_paise: safeTipPaise,
    currency: 'INR',
    status: 'created',
  });

  await Table.update({ status: 'bill_requested' }, { where: { id: table.id } });

  return {
    paymentId: payment.id,
    razorpayOrderId: rzpOrderId,
    amountPaise: totalPayablePaise,
    currency: 'INR',
    keyId: env.RAZORPAY_KEY_ID || 'rzp_test_mock_mode',
    isMock,
  };
}

export async function verifyAndCapturePayment({
  tableSessionId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  method = 'upi',
  io = null,
}) {
  const { Payment, BillSplit, TableSession, Table, sequelize } = getModels();
  const env = getEnv();

  const payment = await Payment.findOne({
    where: { razorpay_order_id: razorpayOrderId, table_session_id: tableSessionId },
  });
  if (!payment) {
    throw new AppError(404, 'Payment order not found for this table session.', 'PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'captured') {
    return { payment, sessionClosed: false };
  }

  const secret = env.RAZORPAY_KEY_SECRET || (!env.isProd ? 'test_mock_secret' : '');
  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const isValid = verifyHmacSha256(payload, secret, razorpaySignature);
  if (!isValid) {
    await recordAuditLog({
      action: 'PAYMENT_SIGNATURE_FAILED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { razorpayOrderId, razorpayPaymentId },
    });
    throw new AppError(400, 'Payment signature verification failed.', 'INVALID_PAYMENT_SIGNATURE');
  }

  const result = await sequelize.transaction(async (transaction) => {
    await payment.update(
      {
        razorpay_payment_id: razorpayPaymentId,
        status: 'captured',
        method: method || 'upi',
      },
      { transaction }
    );

    if (payment.bill_split_id) {
      await BillSplit.update(
        { status: 'paid', tip_paise: payment.tip_paise },
        { where: { id: payment.bill_split_id }, transaction }
      );
    }

    await recordAuditLog({
      action: 'PAYMENT_CAPTURED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { amountPaise: payment.amount_paise, method: payment.method },
      transaction,
    });

    const summary = await computeSessionBillSummary(tableSessionId);
    let sessionClosed = false;

    if (summary.remainingPaise <= 0) {
      const session = await TableSession.findByPk(tableSessionId, { transaction });
      if (session && session.status === 'active') {
        await session.update({ status: 'paid', closed_at: new Date() }, { transaction });
        await Table.update({ status: 'free' }, { where: { id: session.table_id }, transaction });
        sessionClosed = true;
      }
    }

    return { payment, sessionClosed };
  });

  if (io) {
    io.to(`table_session:${tableSessionId}`).emit('payment:captured', {
      paymentId: payment.id,
      amountPaise: payment.amount_paise,
      sessionClosed: result.sessionClosed,
    });
    io.to('role:waiter').to('role:manager').to('role:owner').emit('payment:captured', {
      tableSessionId,
      paymentId: payment.id,
      amountPaise: payment.amount_paise,
      sessionClosed: result.sessionClosed,
    });
  }

  return result;
}

export async function processRazorpayWebhook({ rawBody, signature, eventIdHeader, io = null }) {
  const env = getEnv();
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError(500, 'Webhook secret not configured.', 'WEBHOOK_NOT_CONFIGURED');
  }

  const valid = verifyHmacSha256(rawBody, env.RAZORPAY_WEBHOOK_SECRET, signature);
  if (!valid) {
    throw new AppError(400, 'Invalid webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const eventId =
    eventIdHeader ||
    crypto.createHash('sha256').update(rawBody).digest('hex');

  const { Payment, BillSplit, TableSession, Table, sequelize } = getModels();

  const existingEvent = await Payment.findOne({ where: { webhook_event_id: eventId } });
  if (existingEvent) {
    return { status: 'already_processed' };
  }

  if (event.event === 'payment.captured') {
    const entity = event.payload?.payment?.entity;
    const rzpOrderId = entity?.order_id;
    const rzpPaymentId = entity?.id;
    if (!rzpOrderId || !rzpPaymentId) {
      return { status: 'ignored' };
    }

    const payment = await Payment.findOne({ where: { razorpay_order_id: rzpOrderId } });
    if (!payment) {
      return { status: 'order_not_found' };
    }

    await sequelize.transaction(async (transaction) => {
      if (payment.status !== 'captured') {
        await payment.update(
          {
            razorpay_payment_id: rzpPaymentId,
            status: 'captured',
            method: entity.method || payment.method || 'upi',
            webhook_event_id: eventId,
          },
          { transaction }
        );

        if (payment.bill_split_id) {
          await BillSplit.update(
            { status: 'paid' },
            { where: { id: payment.bill_split_id }, transaction }
          );
        }

        const summary = await computeSessionBillSummary(payment.table_session_id);
        if (summary.remainingPaise <= 0) {
          const session = await TableSession.findByPk(payment.table_session_id, { transaction });
          if (session && session.status === 'active') {
            await session.update({ status: 'paid', closed_at: new Date() }, { transaction });
            await Table.update({ status: 'free' }, { where: { id: session.table_id }, transaction });
          }
        }
      } else {
        await payment.update({ webhook_event_id: eventId }, { transaction });
      }
    });

    if (io) {
      io.to(`table_session:${payment.table_session_id}`).emit('payment:captured', {
        paymentId: payment.id,
        amountPaise: payment.amount_paise,
      });
    }
  }

  return { status: 'processed' };
}
