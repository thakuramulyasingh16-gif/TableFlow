import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['owner', 'manager']);
    const [orders, payments] = await Promise.all([
      prisma.order.findMany({
        include: {
          table: { select: { id: true, tableNumber: true, label: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return NextResponse.json({ orders, payments });
  } catch (err) {
    return handleApiError(err);
  }
}
