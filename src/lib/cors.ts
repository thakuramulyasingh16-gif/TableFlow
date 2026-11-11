import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from './env';

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const env = getEnv();
  return env.corsOrigins.includes(origin);
}

export function applyCorsHeaders(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin');
  if (origin && isOriginAllowed(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}
