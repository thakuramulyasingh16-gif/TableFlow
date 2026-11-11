import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';
import { kitchenItemStatusSchema, parseJsonBody } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    await requireStaffAuth(['chef', 'manager', 'owner']);
    const { itemId } = await context.params;
    const id = Number(itemId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid order item ID.', 'VALIDATION_ERROR');
    }

    const body = await parseJsonBody(req, kitchenItemStatusSchema);

    const item = await prisma.orderItem.findUnique({
      where: { id },
      include: { order: true, station: true },
    });
    if (!item || !item.order) {
      throw new AppError(404, 'Order item not found.', 'ORDER_ITEM_NOT_FOUND');
    }
    if (!['confirmed', 'preparing', 'ready'].includes(item.order.status)) {
      throw new AppError(409, 'Order must be confirmed by staff before kitchen preparation.', 'ORDER_NOT_CONFIRMED');
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id },
        data: { status: body.status },
      });

      const siblings = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
      const allReadyOrServed = siblings.every((s) => s.status === 'ready' || s.status === 'served');
      const anyPreparingOrReady = siblings.some((s) => s.status === 'preparing' || s.status === 'ready');

      let nextOrderStatus: OrderStatus = item.order.status;
      if (allReadyOrServed) nextOrderStatus = 'ready';
      else if (anyPreparingOrReady) nextOrderStatus = 'preparing';

      if (nextOrderStatus !== item.order.status) {
        await tx.order.update({ where: { id: item.orderId }, data: { status: nextOrderStatus } });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: item.orderId },
        include: {
          table: { select: { id: true, tableNumber: true, label: true } },
          items: { include: { station: { select: { id: true, name: true, code: true } } } },
        },
      });
    });

    await Promise.all([
      broadcastRealtime('kitchen:updates', 'kitchen:item_updated', { orderId: updatedOrder.id, itemId: id }),
      broadcastRealtime('staff:updates', 'order:updated', { orderId: updatedOrder.id }),
      broadcastRealtime(`table_session:${updatedOrder.tableSessionId}`, 'order:updated', { orderId: updatedOrder.id }),
    ]);

    return NextResponse.json({ order: updatedOrder });
  } catch (err) {
    return handleApiError(err);
  }
}
