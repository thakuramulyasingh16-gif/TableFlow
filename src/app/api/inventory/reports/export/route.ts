import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireStaffAuth(['manager', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const range = searchParams.get('range') || 'this_month';
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (range === 'last_month') {
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const dailyPurchases = await prisma.$queryRaw<{ day: string; total_spend: bigint }[]>`
      SELECT TO_CHAR(purchased_at, 'YYYY-MM-DD') AS day, SUM(total_cost) AS total_spend
      FROM purchases
      WHERE purchased_at >= ${start} AND purchased_at <= ${end}
      GROUP BY TO_CHAR(purchased_at, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    const dailySales = await prisma.$queryRaw<{ day: string; total_sales: bigint }[]>`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, SUM(amount_paise) AS total_sales
      FROM payments
      WHERE status = 'captured' AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    const dayMap = new Map<string, { spend: number; sales: number }>();
    for (const dp of dailyPurchases) {
      dayMap.set(dp.day, { spend: Number(dp.total_spend) / 100, sales: 0 });
    }
    for (const ds of dailySales) {
      const existing = dayMap.get(ds.day) || { spend: 0, sales: 0 };
      existing.sales = Number(ds.total_sales) / 100;
      dayMap.set(ds.day, existing);
    }

    const sortedDays = Array.from(dayMap.keys()).sort();
    let totalSpend = 0;
    let totalSales = 0;

    const rows = sortedDays.map((d) => {
      const data = dayMap.get(d)!;
      const profit = data.sales - data.spend;
      totalSpend += data.spend;
      totalSales += data.sales;
      return `${d},${data.spend.toFixed(2)},${data.sales.toFixed(2)},${profit.toFixed(2)}`;
    });

    const totalProfit = totalSales - totalSpend;
    const summaryRow = `TOTAL,${totalSpend.toFixed(2)},${totalSales.toFixed(2)},${totalProfit.toFixed(2)}`;

    const csv = ['Date,Raw Material Spend (INR),Sales (INR),Estimated Gross Profit (INR)', ...rows, summaryRow].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tableflow-financial-report-${now.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
