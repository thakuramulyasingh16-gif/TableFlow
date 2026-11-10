import express, { Router } from 'express';
import { handleRazorpayWebhook } from '../controllers/webhookController.js';

const router = Router();

router.post(
  '/razorpay',
  express.raw({ type: 'application/json', limit: '256kb' }),
  handleRazorpayWebhook
);

export default router;
