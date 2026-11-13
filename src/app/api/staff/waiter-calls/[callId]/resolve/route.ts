import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  try {
    const actor = await requireStaffAuth(['waiter', 'manager', 'owner']);
    const { callId } = await context.params;
    const id = Number(callId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid call ID.', 'VALIDATION_ERROR');
    }

    const call = await prisma.waiterCall.findUnique({
      where: { id },
      include: { table: true },
    });
    if (!call) throw new AppError(404, 'Waiter call not found.', 'WAITER_CALL_NOT_FOUND');
    if (call.status === 'resolved') return NextResponse.json({ call });

    const updatedCall = await prisma.waiterCall.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });

    const pendingOthers = await prisma.waiterCall.count({
      where: { tableId: call.tableId, status: 'pending' },
    });

    let nextTableStatus = call.table.status;
    if (pendingOthers === 0 && call.table.status === 'needs_help') {
      const openOrders = await prisma.order.count({
        where: { tableId: call.tableId, status: { in: ['received', 'confirmed', 'preparing', 'ready'] } },
      });
      nextTableStatus = openOrders > 0 ? 'ordered' : 'free';
      await prisma.table.update({ where: { id: call.tableId }, data: { status: nextTableStatus } });
    }

    await Promise.all([
      broadcastRealtime('staff:updates', 'waiter:call_resolved', { callId: id, tableId: call.tableId }),
      broadcastRealtime(`table_session:${call.tableSessionId}`, 'waiter:call_resolved', { callId: id }),
    ]);

    return NextResponse.json({ call: updatedCall, tableStatus: nextTableStatus });
  } catch (err) {
    return handleApiError(err);
  }
}

