import { Op } from 'sequelize';
import { getEnv } from '../config/env.js';
import { getModels } from '../db/models/index.js';
import { issueCsrfCookie } from '../middleware/csrf.js';
import { GUEST_COOKIE_NAME, setGuestSessionCookie } from '../middleware/guestSession.js';
import { createGuestOrder, getSessionOrders } from '../services/orderService.js';
import {
  computeSessionBillSummary,
  createBillSplits,
  createRazorpayOrderForSession,
  verifyAndCapturePayment,
} from '../services/paymentService.js';
import { deleteGuestEmailPii, sendGstEmailReceipt } from '../services/receiptService.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken, sha256Hex } from '../utils/crypto.js';
import { sanitizeUserText } from '../utils/sanitize.js';

const WAITER_CALL_COOLDOWN_MS = 60 * 1000;

export async function initGuestSession(req, res, next) {
  try {
    const { Table, TableSession } = getModels();
    const env = getEnv();
    const { tableToken } = req.body;

    const table = await Table.findOne({
      where: { qr_token: tableToken, is_active: true },
    });
    if (!table) {
      throw new AppError(404, 'Invalid or revoked table QR code.', 'INVALID_TABLE_TOKEN');
    }

    // Reuse active cookie session if it belongs to this same table
    const existingRaw = req.signedCookies?.[GUEST_COOKIE_NAME];
    if (existingRaw && typeof existingRaw === 'string') {
      const existingSession = await TableSession.findOne({
        where: {
          session_token_hash: sha256Hex(existingRaw),
          table_id: table.id,
          status: 'active',
          expires_at: { [Op.gt]: new Date() },
        },
      });
      if (existingSession) {
        const csrfToken = issueCsrfCookie(res);
        return res.json({
          table: { id: table.id, tableNumber: table.table_number, label: table.label, zone: table.zone },
          session: { id: existingSession.id, status: existingSession.status, expiresAt: existingSession.expires_at },
          csrfToken,
        });
      }
    }

    const rawSessionToken = generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + env.GUEST_SESSION_TTL_MINUTES * 60 * 1000);
    const session = await TableSession.create({
      table_id: table.id,
      session_token_hash: sha256Hex(rawSessionToken),
      status: 'active',
      last_activity_at: new Date(),
      expires_at: expiresAt,
    });

    setGuestSessionCookie(res, rawSessionToken, expiresAt);
    const csrfToken = issueCsrfCookie(res);

    return res.status(201).json({
      table: { id: table.id, tableNumber: table.table_number, label: table.label, zone: table.zone },
      session: { id: session.id, status: session.status, expiresAt: session.expires_at },
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function getGuestMenu(_req, res, next) {
  try {
    const { Category, MenuItem, ItemVariant, Deal, KitchenStation } = getModels();
    const now = new Date();

    const [categories, items, deals] = await Promise.all([
      Category.findAll({
        where: { is_active: true },
        order: [['sort_order', 'ASC'], ['name', 'ASC']],
      }),
      MenuItem.findAll({
        include: [
          { model: ItemVariant, as: 'variants', where: { is_available: true }, required: false },
          { model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] },
        ],
        order: [['name', 'ASC']],
      }),
      Deal.findAll({
        where: {
          is_active: true,
          [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }],
        },
        order: [['min_order_paise', 'ASC']],
      }),
    ]);

    const activeDeals = deals.filter((d) => !d.ends_at || new Date(d.ends_at) >= now);

    res.json({
      categories,
      items,
      deals: activeDeals,
    });
  } catch (err) {
    next(err);
  }
}

export async function placeGuestOrder(req, res, next) {
  try {
    const io = req.app.get('io');
    const order = await createGuestOrder({
      tableSession: req.tableSession,
      table: req.table,
      items: req.body.items,
      dealCode: req.body.dealCode,
      notes: req.body.notes,
      io,
    });
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

export async function listGuestOrders(req, res, next) {
  try {
    const orders = await getSessionOrders(req.tableSession.id);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

export async function requestWaiterCall(req, res, next) {
  try {
    const { WaiterCall, Table } = getModels();
    const latest = await WaiterCall.findOne({
      where: { table_session_id: req.tableSession.id },
      order: [['created_at', 'DESC']],
    });

    if (latest) {
      const elapsed = Date.now() - new Date(latest.created_at).getTime();
      if (elapsed < WAITER_CALL_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((WAITER_CALL_COOLDOWN_MS - elapsed) / 1000);
        throw new AppError(
          429,
          `Waiter was just notified. Please wait ${retryAfterSeconds}s before calling again.`,
          'WAITER_CALL_COOLDOWN',
          { retryAfterSeconds }
        );
      }
    }

    const reason = req.body.reason ? sanitizeUserText(req.body.reason, 200) : 'Assistance requested';
    const call = await WaiterCall.create({
      table_id: req.table.id,
      table_session_id: req.tableSession.id,
      reason,
      status: 'pending',
    });

    await Table.update({ status: 'needs_help' }, { where: { id: req.table.id } });

    const io = req.app.get('io');
    if (io) {
      io.to('role:waiter').to('role:manager').to('role:owner').emit('waiter:call_created', {
        call,
        table: { id: req.table.id, table_number: req.table.table_number, label: req.table.label, status: 'needs_help' },
      });
    }

    res.status(201).json({ waiterCall: call, cooldownSeconds: WAITER_CALL_COOLDOWN_MS / 1000 });
  } catch (err) {
    next(err);
  }
}

export async function getGuestBill(req, res, next) {
  try {
    const summary = await computeSessionBillSummary(req.tableSession.id);
    res.json({
      table: { id: req.table.id, tableNumber: req.table.table_number, label: req.table.label },
      sessionStatus: req.tableSession.status,
      ...summary,
    });
  } catch (err) {
    next(err);
  }
}

export async function splitGuestBill(req, res, next) {
  try {
    const splits = await createBillSplits({
      tableSessionId: req.tableSession.id,
      splitType: req.body.splitType,
      parts: req.body.parts,
      itemIds: req.body.itemIds,
    });
    res.status(201).json({ splits });
  } catch (err) {
    next(err);
  }
}

export async function createGuestPaymentOrder(req, res, next) {
  try {
    const orderData = await createRazorpayOrderForSession({
      tableSession: req.tableSession,
      table: req.table,
      billSplitId: req.body.billSplitId ?? null,
      tipPaise: req.body.tipPaise ?? 0,
    });
    res.status(201).json(orderData);
  } catch (err) {
    next(err);
  }
}

export async function verifyGuestPayment(req, res, next) {
  try {
    const io = req.app.get('io');
    const result = await verifyAndCapturePayment({
      tableSessionId: req.tableSession.id,
      razorpayOrderId: req.body.razorpayOrderId,
      razorpayPaymentId: req.body.razorpayPaymentId,
      razorpaySignature: req.body.razorpaySignature,
      method: req.body.method,
      io,
    });
    res.json({
      verified: true,
      payment: result.payment,
      sessionClosed: result.sessionClosed,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendGuestReceipt(req, res, next) {
  try {
    const result = await sendGstEmailReceipt({
      tableSession: req.tableSession,
      table: req.table,
      email: req.body.email,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function deleteGuestPrivacyEmail(req, res, next) {
  try {
    const result = await deleteGuestEmailPii(req.tableSession.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function submitGuestReview(req, res, next) {
  try {
    const { Payment, Review } = getModels();
    const paidCount = await Payment.count({
      where: { table_session_id: req.tableSession.id, status: 'captured' },
    });
    if (paidCount === 0) {
      throw new AppError(400, 'Please complete payment before submitting a review.', 'PAYMENT_REQUIRED_FOR_REVIEW');
    }

    const existing = await Review.findOne({ where: { table_session_id: req.tableSession.id } });
    if (existing) {
      throw new AppError(409, 'Review already submitted for this visit.', 'REVIEW_EXISTS');
    }

    const review = await Review.create({
      table_session_id: req.tableSession.id,
      table_id: req.table.id,
      rating: req.body.rating,
      comment: req.body.comment ? sanitizeUserText(req.body.comment, 500) : null,
    });

    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}
