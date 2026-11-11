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

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
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
