import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const actor = await requireStaffAuth(['waiter', 'manager', 'owner']);
    const { orderId } = await context.params;
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid order ID.', 'VALIDATION_ERROR');
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, tableNumber: true, label: true, zone: true } },
        items: { include: { station: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!order) throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
    if (order.status !== 'received') {
      throw new AppError(409, `Order cannot be confirmed from "${order.status}".`, 'INVALID_ORDER_STATE');
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmedById: actor.id,
        confirmedAt: new Date(),
      },
      include: {
        table: { select: { id: true, tableNumber: true, label: true, zone: true } },
        items: { include: { station: { select: { id: true, name: true, code: true } } } },
      },
    });

    await recordAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'ORDER_CONFIRMED',
      entityType: 'order',
      entityId: updated.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      metadata: { orderNumber: updated.orderNumber },
    });

    await Promise.all([
      broadcastRealtime('kitchen:updates', 'order:confirmed', { orderId: updated.id }),
      broadcastRealtime('staff:updates', 'order:updated', { orderId: updated.id }),
      broadcastRealtime(`table_session:${updated.tableSessionId}`, 'order:updated', { orderId: updated.id }),
    ]);

    return NextResponse.json({ order: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
