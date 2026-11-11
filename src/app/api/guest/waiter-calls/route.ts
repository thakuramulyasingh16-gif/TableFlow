import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, waiterCallSchema } from '@/lib/validators';

const WAITER_CALL_COOLDOWN_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession();
    await enforceRateLimit('waiter_call', `${getClientIp(req)}:${session.id}`);

    const body = await parseJsonBody(req, waiterCallSchema);

    const latest = await prisma.waiterCall.findFirst({
      where: { tableSessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < WAITER_CALL_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((WAITER_CALL_COOLDOWN_MS - elapsed) / 1000);
        throw new AppError(
          429,
          `Waiter was just notified. Please wait ${retryAfterSeconds}s before calling again.`,
          'WAITER_CALL_COOLDOWN',
          { retryAfterSeconds }
        );
      }
    }

    const reason = body.reason ? sanitizeUserText(body.reason, 200) : 'Assistance requested';
    const [call] = await prisma.$transaction([
      prisma.waiterCall.create({
        data: {
          tableId: table.id,
          tableSessionId: session.id,
          reason,
          status: 'pending',
        },
      }),
      prisma.table.update({
        where: { id: table.id },
        data: { status: 'needs_help' },
      }),
    ]);

    await broadcastRealtime('staff:updates', 'waiter:call_created', {
      callId: call.id,
      tableId: table.id,
    });

    return NextResponse.json(
      { waiterCall: call, cooldownSeconds: WAITER_CALL_COOLDOWN_MS / 1000 },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
