import { getEnv } from '../config/env.js';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';
import { sha256Hex } from '../utils/crypto.js';

export const GUEST_COOKIE_NAME = 'tf_guest_session';

export function setGuestSessionCookie(res, rawSessionToken, expiresAt) {
  const env = getEnv();
  res.cookie(GUEST_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    signed: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function requireGuestSession({ allowPaid = false } = {}) {
  return async function guestSessionMiddleware(req, _res, next) {
    try {
      const rawToken = req.signedCookies?.[GUEST_COOKIE_NAME];
      if (!rawToken || typeof rawToken !== 'string') {
        throw new AppError(401, 'Active table session required. Please scan your table QR code.', 'GUEST_SESSION_REQUIRED');
      }

      const { TableSession, Table } = getModels();
      const tokenHash = sha256Hex(rawToken);
      const session = await TableSession.findOne({
        where: { session_token_hash: tokenHash },
        include: [{ model: Table, as: 'table' }],
      });

      if (!session || !session.table || !session.table.is_active) {
        throw new AppError(401, 'Table session is invalid or table is inactive.', 'GUEST_SESSION_INVALID');
      }

      const allowedStatuses = allowPaid ? ['active', 'paid'] : ['active'];
      if (!allowedStatuses.includes(session.status)) {
        throw new AppError(401, 'Table session has ended. Please scan the QR code again.', 'GUEST_SESSION_ENDED');
      }

      if (new Date(session.expires_at) <= new Date()) {
        await session.update({ status: 'expired' });
        throw new AppError(401, 'Table session expired due to inactivity. Please rescan QR.', 'GUEST_SESSION_EXPIRED');
      }

      if (session.status === 'active') {
        const env = getEnv();
        const now = new Date();
        const nextExpiry = new Date(now.getTime() + env.GUEST_SESSION_TTL_MINUTES * 60 * 1000);
        await session.update({ last_activity_at: now, expires_at: nextExpiry });
      }

      req.tableSession = session;
      req.table = session.table;
      next();
    } catch (err) {
      next(err);
    }
  };
}
