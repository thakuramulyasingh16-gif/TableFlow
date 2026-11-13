import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);
    const calls = await prisma.waiterCall.findMany({
      where: { status: 'pending' },
      include: { table: { select: { id: true, tableNumber: true, label: true, zone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ calls });
  } catch (err) {
    return handleApiError(err);
  }
}

