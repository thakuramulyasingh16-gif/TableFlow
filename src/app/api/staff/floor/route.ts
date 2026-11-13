import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);

    const [tables, activeOrders, pendingCalls] = await Promise.all([
      prisma.table.findMany({
        where: { isActive: true },
        select: { id: true, tableNumber: true, label: true, capacity: true, zone: true, status: true },
        orderBy: { id: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: { in: ['received', 'confirmed', 'preparing', 'ready'] } },
        select: { id: true, tableId: true, status: true },
      }),
      prisma.waiterCall.findMany({
        where: { status: 'pending' },
        select: { id: true, tableId: true, reason: true, createdAt: true },
      }),
    ]);

    const floor = tables.map((t) => ({
      ...t,
      activeOrderCount: activeOrders.filter((o) => o.tableId === t.id).length,
      pendingCalls: pendingCalls.filter((c) => c.tableId === t.id),
    }));

    return NextResponse.json({ tables: floor });
  } catch (err) {
    return handleApiError(err);
  }
}

