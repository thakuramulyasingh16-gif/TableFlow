import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);
    const { orderId } = await context.params;
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid order ID.', 'VALIDATION_ERROR');
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
    if (!['ready', 'preparing', 'confirmed'].includes(order.status)) {
      throw new AppError(409, `Order cannot be marked served from "${order.status}".`, 'INVALID_ORDER_STATE');
    }

    const [updated] = await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: { status: 'served' },
        include: {
          table: { select: { id: true, tableNumber: true, label: true } },
          items: true,
        },
      }),
      prisma.orderItem.updateMany({
        where: { orderId: id },
        data: { status: 'served' },
      }),
    ]);

    await Promise.all([
      broadcastRealtime('kitchen:updates', 'order:updated', { orderId: id }),
      broadcastRealtime('staff:updates', 'order:updated', { orderId: id }),
      broadcastRealtime(`table_session:${order.tableSessionId}`, 'order:updated', { orderId: id }),
    ]);

    return NextResponse.json({ order: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
