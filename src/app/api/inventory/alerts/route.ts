import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireStaffAuth(['manager', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const includeResolved = searchParams.get('includeResolved') === 'true';

    const alerts = await prisma.stockAlert.findMany({
      where: includeResolved ? undefined : { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            unit: true,
            stockStatus: true,
          },
        },
        raisedBy: {
          select: { id: true, name: true, email: true },
        },
        acknowledgedBy: {
          select: { id: true, name: true },
        },
        resolvedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const openCount = alerts.filter((a) => a.status === 'OPEN').length;
    const acknowledgedCount = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length;

    return NextResponse.json({
      alerts,
      openCount,
      acknowledgedCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
