import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getRestaurantSettings } from '@/lib/settings';

export const GET = withStaffAuth<{ orderId: string }>(['chef', 'waiter', 'manager', 'owner'], async (req, { params }) => {
  const { orderId } = await params;
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'Invalid order ID.', 'VALIDATION_ERROR');
  }

  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, tableNumber: true, label: true, zone: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            itemNameSnapshot: true,
            variantNameSnapshot: true,
            specialInstructions: true,
            status: true,
          },
        },
      },
    }),
    getRestaurantSettings(),
  ]);

  if (!order) {
    throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
  }

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      confirmedAt: order.confirmedAt || order.createdAt,
      notes: order.notes,
      table: order.table,
      items: order.items,
    },
    restaurantName: settings.restaurantName || 'TableFlow Bistro',
  });
});
