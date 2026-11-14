import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { requireGuestSession } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession();
    await enforceRateLimit('global', `${getClientIp(req)}:${session.id}`);

    const updatedTable = await prisma.table.update({
      where: { id: table.id },
      data: { status: 'bill_requested' },
    });

    await broadcastRealtime('staff:updates', 'table:status_changed', {
      id: table.id,
      tableNumber: table.tableNumber,
      status: 'bill_requested',
    });

    return NextResponse.json({
      success: true,
      table: { id: updatedTable.id, status: updatedTable.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
