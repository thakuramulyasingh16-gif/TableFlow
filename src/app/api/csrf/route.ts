import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CSRF_COOKIE_NAME, setCsrfCookie } from '@/lib/csrf';

export async function GET() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const res = NextResponse.json({ ok: true });
  const csrfToken = setCsrfCookie(res, existing);
  return NextResponse.json({ csrfToken }, { headers: res.headers });
}
