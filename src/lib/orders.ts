import { AppError } from './api-error';
import { recordAuditLog } from './audit';
import { prisma } from './prisma';
import { broadcastRealtime } from './realtime';

export async function cancelStaffOrder({
  orderId,
  actorUserId,
  actorRole,
  reason,
}: {
  orderId: number;
  actorUserId?: number;
  actorRole?: string;
  reason?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: true },
  });
  if (!order) {
    throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
  }

  if (order.status === 'cancelled') {
    throw new AppError(400, 'Order is already cancelled.', 'ORDER_ALREADY_CANCELLED');
  }

  // Waiter/manager can only cancel before cooking (status is 'received' or 'confirmed')
  if (['preparing', 'ready', 'served'].includes(order.status)) {
    throw new AppError(
      400,
      `Cannot cancel order once cooking has started (current status: ${order.status}).`,
      'ORDER_ALREADY_COOKING'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: { status: 'cancelled' },
    });

    await recordAuditLog({
      actorUserId,
      actorRole,
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: order.id,
      metadata: { reason, orderNumber: order.orderNumber, tableId: order.tableId },
      tx,
    });

    return o;
  });

  await Promise.all([
    broadcastRealtime(`table_session:${order.tableSessionId}`, 'order:updated', {
      orderId: order.id,
      status: 'cancelled',
    }),
    broadcastRealtime('staff:updates', 'order:updated', {
      orderId: order.id,
      status: 'cancelled',
    }),
  ]);

  return updated;
}
