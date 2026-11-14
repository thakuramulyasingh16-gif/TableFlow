import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from './api-error';
import { generateOpaqueToken, timingSafeEqualStr } from './crypto';
import { getEnv } from './env';

export const CSRF_COOKIE_NAME = 'tf_csrf';

export function setCsrfCookie(res: NextResponse, existingToken?: string): string {
  const env = getEnv();
  const token = existingToken && existingToken.length >= 16 ? existingToken : generateOpaqueToken(24);
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
  return token;
}

export async function requireCsrf(req: NextRequest): Promise<void> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  // 1. Verify Sec-Fetch-Site header (reject cross-site request forgery attempts)
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    throw new AppError(403, 'Cross-site request blocked', 'CSRF_CROSS_SITE');
  }

  // 2. Verify Origin header on mutating requests
  const originHeader = req.headers.get('origin');
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
      const hostName = host.split(':')[0].toLowerCase();
      const originHost = originUrl.hostname.toLowerCase();

      const env = getEnv();
      const appUrlHost = new URL(env.NEXT_PUBLIC_APP_URL).hostname.toLowerCase();

      const isAllowed =
        originHost === hostName ||
        originHost === appUrlHost ||
        originHost === 'localhost' ||
        originHost === '127.0.0.1';

      if (!isAllowed) {
        throw new AppError(403, 'Invalid request origin', 'CSRF_ORIGIN_INVALID');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(403, 'Malformed request origin', 'CSRF_ORIGIN_INVALID');
    }
  }

  // 3. Double-submit cookie verification
  let cookieToken = req.cookies?.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) {
    try {
      const cookieStore = await cookies();
      cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    } catch {
      // not in Next.js cookieStore context
    }
  }
  const headerToken = req.headers.get('x-csrf-token');

  if (
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    cookieToken.length < 16 ||
    !timingSafeEqualStr(cookieToken, headerToken)
  ) {
    throw new AppError(403, 'Invalid or missing CSRF token', 'CSRF_INVALID');
  }
}

