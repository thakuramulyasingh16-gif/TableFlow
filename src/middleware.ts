import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders, isOriginAllowed } from './lib/cors';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'nonce-${nonce}' https://checkout.razorpay.com`
    : `'self' 'nonce-${nonce}' https://checkout.razorpay.com`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.public.blob.vercel-storage.com",
    "connect-src 'self' https://api.razorpay.com https://*.supabase.co wss://*.supabase.co",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV !== 'production';

  // 1. API CORS & Preflight handling
  if (pathname.startsWith('/api/')) {
    const origin = req.headers.get('origin');
    if (origin && !isOriginAllowed(origin)) {
      return NextResponse.json(
        { error: { code: 'CORS_FORBIDDEN', message: 'Origin not allowed' } },
        { status: 403 }
      );
    }

    if (req.method === 'OPTIONS') {
      const preflight = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, preflight);
    }

    const res = NextResponse.next();
    return applyCorsHeaders(req, res);
  }

  // 2. Nonce-based CSP for document requests
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
