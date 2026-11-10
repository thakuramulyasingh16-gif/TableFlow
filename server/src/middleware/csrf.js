import { getEnv } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken, timingSafeEqualHex } from '../utils/crypto.js';

export const CSRF_COOKIE_NAME = 'tf_csrf';

export function issueCsrfCookie(res) {
  const env = getEnv();
  const token = generateOpaqueToken(24);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return token;
}

export function requireCsrf(req, _res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];

  if (
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    cookieToken.length < 16 ||
    !timingSafeEqualHex(cookieToken, headerToken)
  ) {
    return next(new AppError(403, 'Invalid or missing CSRF token', 'CSRF_INVALID'));
  }

  return next();
}
