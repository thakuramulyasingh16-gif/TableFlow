import { Router } from 'express';
import {
  createGuestPaymentOrder,
  deleteGuestPrivacyEmail,
  getGuestBill,
  getGuestMenu,
  initGuestSession,
  listGuestOrders,
  placeGuestOrder,
  requestWaiterCall,
  sendGuestReceipt,
  splitGuestBill,
  submitGuestReview,
  verifyGuestPayment,
} from '../controllers/guestController.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireGuestSession } from '../middleware/guestSession.js';
import { guestOrderLimiter, paymentLimiter, waiterCallLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  billSplitSchema,
  createOrderSchema,
  createPaymentOrderSchema,
  createReviewSchema,
  initSessionSchema,
  sendReceiptSchema,
  verifyPaymentSchema,
  waiterCallSchema,
} from '../validators/guestValidators.js';

const router = Router();

router.post('/sessions/init', validate(initSessionSchema), initGuestSession);
router.get('/menu', requireGuestSession(), getGuestMenu);

router.get('/orders', requireGuestSession({ allowPaid: true }), listGuestOrders);
router.post(
  '/orders',
  requireGuestSession(),
  requireCsrf,
  guestOrderLimiter,
  validate(createOrderSchema),
  placeGuestOrder
);

router.post(
  '/waiter-calls',
  requireGuestSession(),
  requireCsrf,
  waiterCallLimiter,
  validate(waiterCallSchema),
  requestWaiterCall
);

router.get('/bill', requireGuestSession({ allowPaid: true }), getGuestBill);
router.post(
  '/bill/split',
  requireGuestSession(),
  requireCsrf,
  validate(billSplitSchema),
  splitGuestBill
);

router.post(
  '/payments/create-order',
  requireGuestSession(),
  requireCsrf,
  paymentLimiter,
  validate(createPaymentOrderSchema),
  createGuestPaymentOrder
);
router.post(
  '/payments/verify',
  requireGuestSession(),
  requireCsrf,
  paymentLimiter,
  validate(verifyPaymentSchema),
  verifyGuestPayment
);

router.post(
  '/receipts/email',
  requireGuestSession({ allowPaid: true }),
  requireCsrf,
  validate(sendReceiptSchema),
  sendGuestReceipt
);
router.delete(
  '/privacy/email',
  requireGuestSession({ allowPaid: true }),
  requireCsrf,
  deleteGuestPrivacyEmail
);

router.post(
  '/reviews',
  requireGuestSession({ allowPaid: true }),
  requireCsrf,
  validate(createReviewSchema),
  submitGuestReview
);

export default router;
