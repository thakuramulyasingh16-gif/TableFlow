import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { generateOpaqueToken } from '@/lib/crypto';
import { CSRF_COOKIE_NAME, isTokenFormatValid, setCsrfCookie } from '@/lib/csrf';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const searchParams = req.nextUrl?.searchParams;
  const forceRefresh =
    searchParams?.get('refresh') === '1' || searchParams?.get('force') === 'true';

  const tokenToUse =
    !forceRefresh && isTokenFormatValid(existing) ? existing : generateOpaqueToken(24);

  const res = NextResponse.json({ csrfToken: tokenToUse });
  setCsrfCookie(res, tokenToUse);
  return res;
}
