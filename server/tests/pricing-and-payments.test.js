import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { resetEnvCache } from '../src/config/env.js';
import { setModels } from '../src/db/models/index.js';
import { createApp } from '../src/app.js';
import { calculateOrderPricing } from '../src/services/pricingService.js';
import { processRazorpayWebhook, verifyAndCapturePayment } from '../src/services/paymentService.js';

function setupEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '5000',
    APP_BASE_URL: 'http://localhost:5173',
    API_BASE_URL: 'http://localhost:5000',
    CORS_ORIGIN: 'http://localhost:5173',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_NAME: 'tableflow_test',
    DB_USER: 'tableflow_app',
    DB_PASSWORD: 'StrongTestPassword123!',
    JWT_ACCESS_SECRET: 'dummy-access'.padEnd(48, 'a'),
    JWT_REFRESH_SECRET: 'dummy-refresh'.padEnd(48, 'b'),
    COOKIE_SECRET: 'dummy-cookie'.padEnd(48, 'c'),
    RAZORPAY_KEY_ID: 'rzp_test_unit_key',
    RAZORPAY_KEY_SECRET: 'dummy-rzp-key'.padEnd(28, 'x'),
    RAZORPAY_WEBHOOK_SECRET: 'dummy-rzp-wh'.padEnd(28, 'y'),
  });
  resetEnvCache();
}

test('calculateOrderPricing computes variants, deals, CGST, SGST, and total server-side in integer paise', () => {
  const menuItemsMap = new Map([
    [1, { id: 1, name: 'Paneer Tikka', category_id: 1, station_id: 1, base_price_paise: 32000, is_available: true }],
    [2, { id: 2, name: 'Garlic Naan', category_id: 3, station_id: 1, base_price_paise: 9500, is_available: true }],
  ]);
  const variantsMap = new Map([
    [10, { id: 10, menu_item_id: 1, name: 'Platter', price_delta_paise: 14000, is_available: true }],
  ]);
  const deal = {
    id: 1,
    code: 'WELCOME10',
    discount_type: 'percent',
    discount_value: 10,
    min_order_paise: 49900,
    applicable_category_id: null,
    is_active: true,
    starts_at: null,
    ends_at: null,
  };

  // (32000 + 14000) * 1 + 9500 * 2 = 46000 + 19000 = 65000 paise (₹650)
  // 10% discount = 6500 paise -> taxable = 58500
  // CGST 2.5% = 1463, SGST 2.5% = 1463 -> total = 58500 + 1463 + 1463 = 61426
  const result = calculateOrderPricing({
    requestedItems: [
      { menuItemId: 1, variantId: 10, quantity: 1, specialInstructions: '<b>Less oil</b>' },
      { menuItemId: 2, variantId: null, quantity: 2 },
    ],
    menuItemsMap,
    variantsMap,
    deal,
    cgstBps: 250,
    sgstBps: 250,
  });

  assert.equal(result.subtotalPaise, 65000);
  assert.equal(result.discountPaise, 6500);
  assert.equal(result.cgstPaise, 1463);
  assert.equal(result.sgstPaise, 1463);
  assert.equal(result.totalPaise, 61426);
  assert.equal(result.resolvedItems[0].specialInstructions, 'Less oil');
});

test('calculateOrderPricing rejects unavailable item or mismatched variant', () => {
  const menuItemsMap = new Map([
    [1, { id: 1, name: 'Sold Out Dish', category_id: 1, station_id: 1, base_price_paise: 20000, is_available: false }],
  ]);
  assert.throws(
    () =>
      calculateOrderPricing({
        requestedItems: [{ menuItemId: 1, quantity: 1 }],
        menuItemsMap,
        variantsMap: new Map(),
      }),
    (err) => err.code === 'ITEM_UNAVAILABLE'
  );
});

test('verifyAndCapturePayment enforces HMAC signature and closes fully paid session', async () => {
  setupEnv();
  const paymentRecord = {
    id: 5,
    table_session_id: 99,
    bill_split_id: null,
    razorpay_order_id: 'order_test_001',
    razorpay_payment_id: null,
    amount_paise: 61426,
    tip_paise: 0,
    status: 'created',
    method: null,
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
  };
  const sessionRecord = {
    id: 99,
    table_id: 3,
    status: 'active',
    closed_at: null,
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
  };
  let tableStatus = 'bill_requested';

  setModels({
    Order: {
      async findAll() {
        return [{ subtotal_paise: 65000, discount_paise: 6500, cgst_paise: 1463, sgst_paise: 1463, total_paise: 61426, items: [] }];
      },
    },
    OrderItem: {},
    BillSplit: {
      async findAll() {
        return [];
      },
    },
    Payment: {
      async findOne({ where }) {
        if (where.razorpay_order_id === paymentRecord.razorpay_order_id && where.table_session_id === 99) {
          return paymentRecord;
        }
        return null;
      },
      async findAll() {
        return [paymentRecord];
      },
    },
    TableSession: {
      async findByPk(id) {
        return id === 99 ? sessionRecord : null;
      },
    },
    Table: {
      async update(patch) {
        tableStatus = patch.status;
      },
    },
    AuditLog: {
      async create() {
        return {};
      },
    },
    sequelize: {
      async transaction(fn) {
        return fn({});
      },
    },
  });

  // Invalid signature must fail
  await assert.rejects(
    () =>
      verifyAndCapturePayment({
        tableSessionId: 99,
        razorpayOrderId: 'order_test_001',
        razorpayPaymentId: 'pay_test_001',
        razorpaySignature: 'deadbeef'.repeat(8),
      }),
    (err) => err.code === 'INVALID_PAYMENT_SIGNATURE'
  );

  // Valid signature succeeds and closes table session
  const validSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update('order_test_001|pay_test_001')
    .digest('hex');

  const res = await verifyAndCapturePayment({
    tableSessionId: 99,
    razorpayOrderId: 'order_test_001',
    razorpayPaymentId: 'pay_test_001',
    razorpaySignature: validSig,
    method: 'upi',
  });

  assert.equal(res.payment.status, 'captured');
  assert.equal(res.sessionClosed, true);
  assert.equal(sessionRecord.status, 'paid');
  assert.equal(tableStatus, 'free');
});

test('processRazorpayWebhook verifies signature and enforces idempotency', async () => {
  setupEnv();
  const paymentRecord = {
    id: 8,
    table_session_id: 100,
    bill_split_id: null,
    razorpay_order_id: 'order_wh_001',
    razorpay_payment_id: null,
    amount_paise: 50000,
    tip_paise: 0,
    status: 'created',
    webhook_event_id: null,
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
  };

  setModels({
    Order: {
      async findAll() {
        return [{ subtotal_paise: 50000, discount_paise: 0, cgst_paise: 0, sgst_paise: 0, total_paise: 50000, items: [] }];
      },
    },
    OrderItem: {},
    BillSplit: { async findAll() { return []; } },
    Payment: {
      async findOne({ where }) {
        if (where.webhook_event_id && where.webhook_event_id === paymentRecord.webhook_event_id) {
          return paymentRecord;
        }
        if (where.razorpay_order_id === paymentRecord.razorpay_order_id) {
          return paymentRecord;
        }
        return null;
      },
      async findAll() {
        return [paymentRecord];
      },
    },
    TableSession: {
      async findByPk() {
        return { id: 100, table_id: 1, status: 'active', async update() {} };
      },
    },
    Table: { async update() {} },
    sequelize: { async transaction(fn) { return fn({}); } },
  });

  const bodyBuf = Buffer.from(
    JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_wh_001', order_id: 'order_wh_001', method: 'upi' } } },
    })
  );
  const sig = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(bodyBuf)
    .digest('hex');

  const first = await processRazorpayWebhook({
    rawBody: bodyBuf,
    signature: sig,
    eventIdHeader: 'evt_unique_1',
  });
  assert.equal(first.status, 'processed');
  assert.equal(paymentRecord.status, 'captured');

  const duplicate = await processRazorpayWebhook({
    rawBody: bodyBuf,
    signature: sig,
    eventIdHeader: 'evt_unique_1',
  });
  assert.equal(duplicate.status, 'already_processed');
});

test('POST /api/webhooks/razorpay rejects invalid signature over HTTP', async () => {
  setupEnv();
  const app = createApp();
  const res = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', '0'.repeat(64))
    .send(JSON.stringify({ event: 'payment.captured' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
});
