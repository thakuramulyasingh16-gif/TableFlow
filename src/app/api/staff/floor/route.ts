import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);

    const [tables, activeSessions, activeOrders, pendingCalls] = await Promise.all([
      prisma.table.findMany({
        where: { isActive: true },
        select: { id: true, tableNumber: true, label: true, capacity: true, zone: true, status: true },
        orderBy: { id: 'asc' },
      }),
      prisma.tableSession.findMany({
        where: { status: 'active', expiresAt: { gt: new Date() } },
        select: { id: true, tableId: true, joinPin: true, createdAt: true },
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

    const activeSessionIds = activeSessions.map((s) => s.id);
    const pendingUpiPayments =
      activeSessionIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              tableSessionId: { in: activeSessionIds },
              status: 'created',
              method: 'upi_qr',
              createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
            },
            select: { id: true, tableSessionId: true, amountPaise: true, razorpayOrderId: true },
          })
        : [];
    const upiBySession = new Map(pendingUpiPayments.map((p) => [p.tableSessionId, p]));

    const sessionByTable = new Map(activeSessions.map((s) => [s.tableId, s]));

    const floor = tables.map((t) => {
      const activeSess = sessionByTable.get(t.id);
      return {
        ...t,
        pin: activeSess?.joinPin || null,
        activeSessionId: activeSess?.id || null,
        activeOrderCount: activeOrders.filter((o) => o.tableId === t.id).length,
        pendingCalls: pendingCalls.filter((c) => c.tableId === t.id),
        pendingUpiPayment: activeSess ? upiBySession.get(activeSess.id) || null : null,
      };
    });

    return NextResponse.json({ tables: floor });
  } catch (err) {
    return handleApiError(err);
  }
}

