import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders, isOriginAllowed } from './lib/cors';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
