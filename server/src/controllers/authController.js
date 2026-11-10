import { getEnv } from '../config/env.js';
import { issueCsrfCookie } from '../middleware/csrf.js';
import { loginStaff, logoutStaff, rotateRefreshToken } from '../services/authService.js';

export const REFRESH_COOKIE_NAME = 'tf_refresh_token';

function setRefreshCookie(res, token, expiresAt) {
  const env = getEnv();
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/api/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res) {
  const env = getEnv();
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

export async function getCsrfToken(req, res) {
  const csrfToken = issueCsrfCookie(res);
  res.json({ csrfToken });
}

export async function login(req, res, next) {
  try {
    const result = await loginStaff({
      email: req.body.email,
      password: req.body.password,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);
    const csrfToken = issueCsrfCookie(res);

    res.json({
      accessToken: result.accessToken,
      csrfToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await rotateRefreshToken({
      rawRefreshToken,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);
    const csrfToken = issueCsrfCookie(res);

    res.json({
      accessToken: result.accessToken,
      csrfToken,
      user: result.user,
    });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await logoutStaff({
      rawRefreshToken,
      userId: req.user?.id || null,
      role: req.user?.role || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: req.user });
}
