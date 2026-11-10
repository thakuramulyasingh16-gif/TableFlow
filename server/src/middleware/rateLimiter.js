import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});

export const guestOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.tableSession?.id || 'anon'}`,
  message: { error: { code: 'ORDER_RATE_LIMITED', message: 'Order rate limit reached. Please wait a moment.' } },
});

export const waiterCallLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.tableSession?.id || 'anon'}`,
  message: { error: { code: 'WAITER_CALL_RATE_LIMITED', message: 'Please wait before calling a waiter again.' } },
});

export const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.tableSession?.id || 'anon'}`,
  message: { error: { code: 'PAYMENT_RATE_LIMITED', message: 'Too many payment requests. Try again shortly.' } },
});
