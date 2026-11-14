import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function getDateRange(range: string, customStart?: string | null, customEnd?: string | null): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      // Monday as first day of week
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      if (customStart && customEnd) {
        const cs = new Date(customStart);
        const ce = new Date(customEnd);
        if (!isNaN(cs.getTime()) && !isNaN(ce.getTime())) {
          cs.setHours(0, 0, 0, 0);
          ce.setHours(23, 59, 59, 999);
          return { start: cs, end: ce };
        }
      }
      // Fallback: 30 days
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      // Default: This month
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    await requireStaffAuth(['manager', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const range = searchParams.get('range') || 'this_month';
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');

    const { start, end } = getDateRange(range, customStart, customEnd);

    // 1. Total Raw-Material Spend & Count via SQL aggregation
    const purchaseAgg = await prisma.purchase.aggregate({
      where: {
        purchasedAt: { gte: start, lte: end },
      },
      _sum: { totalCost: true },
      _count: { id: true },
    });
    const totalSpendPaise = purchaseAgg._sum.totalCost || 0;
    const purchaseCount = purchaseAgg._count.id;

    // 2. Total Sales from Captured Payments (or paid orders)
    const paymentAgg = await prisma.payment.aggregate({
      where: {
        status: 'captured',
        createdAt: { gte: start, lte: end },
      },
      _sum: { amountPaise: true },
      _count: { id: true },
    });
    const totalSalesPaise = paymentAgg._sum.amountPaise || 0;
    const paidOrderCount = paymentAgg._count.id;

    // 3. Estimated Gross Profit = Sales minus Spend
    const estimatedGrossProfitPaise = totalSalesPaise - totalSpendPaise;

    // 4. Daily Spend aggregated via SQL grouping
    const dailyPurchases: { day: string; total_spend: bigint }[] = await prisma.$queryRaw`
      SELECT
        TO_CHAR(purchased_at, 'YYYY-MM-DD') AS day,
        SUM(total_cost) AS total_spend
      FROM purchases
      WHERE purchased_at >= ${start} AND purchased_at <= ${end}
      GROUP BY TO_CHAR(purchased_at, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    // 5. Daily Sales aggregated via SQL grouping
    const dailySales: { day: string; total_sales: bigint }[] = await prisma.$queryRaw`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM-DD') AS day,
        SUM(amount_paise) AS total_sales
      FROM payments
      WHERE status = 'captured' AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    // 5b. Payment Method Breakdown (Cash vs Counter UPI vs Online)
    const paymentMethodsRaw: { method: string; total_amount: bigint; payment_count: bigint }[] = await prisma.$queryRaw`
      SELECT
        COALESCE(method, 'online') AS method,
        SUM(amount_paise) AS total_amount,
        COUNT(id) AS payment_count
      FROM payments
      WHERE status = 'captured' AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY COALESCE(method, 'online')
      ORDER BY total_amount DESC
    `;

    // Build timeline map for spend vs sales over time
    const dayMap = new Map<string, { date: string; spendPaise: number; salesPaise: number; estimatedProfitPaise: number }>();

    for (const dp of dailyPurchases) {
      const spend = Number(dp.total_spend);
      dayMap.set(dp.day, {
        date: dp.day,
        spendPaise: spend,
        salesPaise: 0,
        estimatedProfitPaise: -spend,
      });
    }

    for (const ds of dailySales) {
      const sales = Number(ds.total_sales);
      const existing = dayMap.get(ds.day) || {
        date: ds.day,
        spendPaise: 0,
        salesPaise: 0,
        estimatedProfitPaise: 0,
      };
      existing.salesPaise = sales;
      existing.estimatedProfitPaise = sales - existing.spendPaise;
      dayMap.set(ds.day, existing);
    }

    const timeline = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 6. Top 10 Ingredients by Spend
    const topIngredientsRaw: { ingredient_id: number; ingredient_name: string; total_spend: bigint; purchase_count: bigint }[] = await prisma.$queryRaw`
      SELECT
        p.ingredient_id,
        i.name AS ingredient_name,
        SUM(p.total_cost) AS total_spend,
        COUNT(p.id) AS purchase_count
      FROM purchases p
      JOIN ingredients i ON p.ingredient_id = i.id
      WHERE p.purchased_at >= ${start} AND p.purchased_at <= ${end}
      GROUP BY p.ingredient_id, i.name
      ORDER BY total_spend DESC
      LIMIT 10
    `;

    const topIngredients = topIngredientsRaw.map((t) => ({
      ingredientId: t.ingredient_id,
      name: t.ingredient_name,
      totalSpendPaise: Number(t.total_spend),
      totalSpendRupees: Number(t.total_spend) / 100,
      purchaseCount: Number(t.purchase_count),
    }));

    return NextResponse.json({
      range,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      summary: {
        totalSpendPaise,
        totalSpendRupees: totalSpendPaise / 100,
        totalSalesPaise,
        totalSalesRupees: totalSalesPaise / 100,
        estimatedGrossProfitPaise,
        estimatedGrossProfitRupees: estimatedGrossProfitPaise / 100,
        grossProfitLabel: 'Estimated gross profit (total captured sales minus raw-material spend)',
        purchaseCount,
        paidOrderCount,
      },
      topIngredients,
      paymentMethods: paymentMethodsRaw.map((pm) => ({
        method: pm.method,
        totalPaise: Number(pm.total_amount),
        totalRupees: Number(pm.total_amount) / 100,
        count: Number(pm.payment_count),
      })),
      timeline: timeline.map((t) => ({
        ...t,
        spendRupees: t.spendPaise / 100,
        salesRupees: t.salesPaise / 100,
        estimatedProfitRupees: t.estimatedProfitPaise / 100,
      })),
      monthlyTable: timeline.map((t) => ({
        date: t.date,
        spendRupees: t.spendPaise / 100,
        salesRupees: t.salesPaise / 100,
        netRupees: (t.salesPaise - t.spendPaise) / 100,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
