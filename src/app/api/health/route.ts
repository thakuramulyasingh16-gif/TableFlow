import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  let dbStatus = 'disconnected';
  let latencyMs: number | null = null;
  let healthy = false;

  try {
    const dbPingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    latencyMs = Date.now() - dbPingStart;
    dbStatus = 'connected';
    healthy = true;
  } catch {
    dbStatus = 'unreachable';
    healthy = false;
  }

  const payload = {
    status: healthy ? 'ok' : 'degraded',
    app: 'healthy',
    database: dbStatus,
    ...(latencyMs !== null ? { dbLatencyMs: latencyMs } : {}),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    durationMs: Date.now() - start,
  };

  return NextResponse.json(payload, {
    status: healthy ? 200 : 503,
  });
}
