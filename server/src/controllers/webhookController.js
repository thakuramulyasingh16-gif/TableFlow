import { processRazorpayWebhook } from '../services/paymentService.js';

export async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const eventIdHeader = req.headers['x-razorpay-event-id'];
    const io = req.app.get('io');

    const result = await processRazorpayWebhook({
      rawBody: req.body,
      signature: typeof signature === 'string' ? signature : '',
      eventIdHeader: typeof eventIdHeader === 'string' ? eventIdHeader : '',
      io,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
