import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';

export const POST = withStaffAuth<{ orderId: string }>(['waiter', 'manager', 'owner'], async (_req, { params }) => {
  const { orderId } = await params;
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
});

