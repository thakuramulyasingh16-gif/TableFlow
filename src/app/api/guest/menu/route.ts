import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireGuestSession } from '@/lib/guest-session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireGuestSession();
    const now = new Date();

    const [categories, items, deals] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.menuItem.findMany({
        include: {
          variants: { where: { isAvailable: true } },
          station: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.deal.findMany({
        where: {
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        orderBy: { minOrderPaise: 'asc' },
      }),
    ]);

    const activeDeals = deals.filter((d) => !d.endsAt || d.endsAt >= now);
    return NextResponse.json({ categories, items, deals: activeDeals });
  } catch (err) {
    return handleApiError(err);
  }
}
