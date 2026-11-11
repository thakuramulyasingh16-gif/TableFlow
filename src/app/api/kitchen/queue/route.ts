import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['chef', 'manager', 'owner']);

    const [stations, orders] = await Promise.all([
      prisma.kitchenStation.findMany({ orderBy: { displayOrder: 'asc' } }),
      prisma.order.findMany({
        where: { status: { in: ['confirmed', 'preparing', 'ready'] } },
        include: {
          table: { select: { id: true, tableNumber: true, label: true } },
          items: { include: { station: { select: { id: true, name: true, code: true } } } },
        },
        orderBy: [{ confirmedAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const grouped = stations.map((st) => {
      const tickets = [];
      for (const ord of orders) {
        const stationItems = ord.items.filter((it) => it.stationId === st.id && it.status !== 'served');
        if (stationItems.length > 0) {
          tickets.push({
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            orderStatus: ord.status,
            table: ord.table,
            confirmedAt: ord.confirmedAt || ord.createdAt,
            notes: ord.notes,
            items: stationItems,
          });
        }
      }
      return { station: st, tickets };
    });

    return NextResponse.json({ stations: grouped });
  } catch (err) {
    return handleApiError(err);
  }
}
