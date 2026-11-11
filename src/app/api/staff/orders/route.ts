import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);

    const orders = await prisma.order.findMany({
      where: { status: { in: ['received', 'confirmed', 'preparing', 'ready'] } },
      include: {
        table: { select: { id: true, tableNumber: true, label: true, zone: true } },
        items: { include: { station: { select: { id: true, name: true, code: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    return handleApiError(err);
  }
}
