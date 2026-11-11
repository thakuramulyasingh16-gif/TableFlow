import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireStaffAuth(['owner', 'manager']);
    const [categories, stations, items, deals] = await Promise.all([
      prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.kitchenStation.findMany({ orderBy: { displayOrder: 'asc' } }),
      prisma.menuItem.findMany({
        include: {
          variants: true,
          category: { select: { id: true, name: true } },
          station: { select: { id: true, name: true, code: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.deal.findMany({ orderBy: { id: 'desc' } }),
    ]);

    return NextResponse.json({ categories, stations, items, deals });
  } catch (err) {
    return handleApiError(err);
  }
}
