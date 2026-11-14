import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireGuestSession } from '@/lib/guest-session';
import { evaluateDishAvailability } from '@/lib/inventory/availability';
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
        where: { archivedAt: null },
        include: {
          variants: { where: { isAvailable: true } },
          station: { select: { id: true, name: true, code: true } },
          recipeItems: {
            include: { ingredient: true },
          },
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

    const publicItems = items.map((item) => {
      const avail = evaluateDishAvailability(item);
      // Strip internal recipe details and override reason from guest exposure
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { recipeItems, isAvailableOverride, overrideReason, archivedAt, ...publicData } = item;
      return {
        ...publicData,
        isAvailable: avail.isAvailable,
      };
    });

    const res = NextResponse.json({ categories, items: publicItems, deals: activeDeals });
    res.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

