import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const start = Date.now();
  let dbStatus = 'disconnected';
  let latencyMs: number | null = null;
  let healthy = false;

  try {
    await enforceRateLimit('health', getClientIp(req));

    const dbPingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    latencyMs = Date.now() - dbPingStart;
    dbStatus = 'connected';
    healthy = true;

    const payload = {
      status: healthy ? 'ok' : 'degraded',
      app: 'healthy',
      database: dbStatus,
      ...(latencyMs !== null ? { dbLatencyMs: latencyMs } : {}),
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };

    return NextResponse.json(payload, {
      status: 200,
    });
  } catch (err) {
    if (dbStatus === 'disconnected' || !healthy) {
      // Return degraded status if database check failed
      return NextResponse.json(
        {
          status: 'degraded',
          app: 'healthy',
          database: 'unreachable',
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - start,
        },
        { status: 503 }
      );
    }
    return handleApiError(err);
  }
}
