import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth, withStaffAuth } from '@/lib/auth-guard';
import { syncAvailabilityForIngredient } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/sanitize';
import { createPurchaseSchema, parseJsonBody } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireStaffAuth(['manager', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const ingredientIdParam = searchParams.get('ingredientId');
    const supplierParam = searchParams.get('supplier');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const format = searchParams.get('format');

    const where: Record<string, unknown> = {};

    if (ingredientIdParam) {
      const iId = parseInt(ingredientIdParam, 10);
      if (!isNaN(iId)) where.ingredientId = iId;
    }

    if (supplierParam) {
      where.supplier = { contains: supplierParam.trim(), mode: 'insensitive' };
    }

    if (startDateParam || endDateParam) {
      const dateFilter: Record<string, Date> = {};
      if (startDateParam) {
        const s = new Date(startDateParam);
        if (!isNaN(s.getTime())) dateFilter.gte = s;
      }
      if (endDateParam) {
        const e = new Date(endDateParam);
        if (!isNaN(e.getTime())) dateFilter.lte = e;
      }
      if (Object.keys(dateFilter).length > 0) {
        where.purchasedAt = dateFilter;
      }
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        ingredient: { select: { id: true, name: true, unit: true, stockStatus: true } },
        purchasedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { purchasedAt: 'desc' },
      take: 200,
    });

    if (format === 'csv') {
      const csvHeader = 'ID,Date,Ingredient,Quantity,Unit,Amount (INR),Supplier,Purchased By,Received Date,Notes\n';
      const csvRows = purchases.map((p) => {
        const dateStr = p.purchasedAt.toISOString().slice(0, 10);
        const receivedStr = p.receivedAt ? p.receivedAt.toISOString().slice(0, 10) : 'Pending';
        const amountInr = (p.totalCost / 100).toFixed(2);
        const escapeCsv = (str?: string | null) => `"${(str || '').replace(/"/g, '""')}"`;
        return [
          p.id,
          dateStr,
          escapeCsv(p.ingredient.name),
          Number(p.quantity),
          p.unit,
          amountInr,
          escapeCsv(p.supplier),
          escapeCsv(p.purchasedBy.name),
          receivedStr,
          escapeCsv(p.notes),
        ].join(',');
      });

      return new NextResponse(csvHeader + csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="tableflow-purchases-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const totalPaise = purchases.reduce((acc, p) => acc + p.totalCost, 0);

    return NextResponse.json({
      purchases: purchases.map((p) => ({
        id: p.id,
        ingredientId: p.ingredientId,
        ingredientName: p.ingredient.name,
        quantity: Number(p.quantity),
        unit: p.unit,
        totalCostPaise: p.totalCost,
        totalCostRupees: p.totalCost / 100,
        supplier: p.supplier,
        notes: p.notes,
        purchasedByName: p.purchasedBy.name,
        purchasedAt: p.purchasedAt,
        receivedAt: p.receivedAt,
        alertId: p.alertId,
      })),
      totalCount: purchases.length,
      totalSpendPaise: totalPaise,
      totalSpendRupees: totalPaise / 100,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withStaffAuth(['manager', 'owner'], async (req, { actor: staff }) => {
  await enforceRateLimit('purchase', `${getClientIp(req)}:${staff.id}`);

  const body = await parseJsonBody(req, createPurchaseSchema);

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: body.ingredientId, archivedAt: null },
    });

    if (!ingredient) {
      throw new AppError(404, 'Ingredient not found', 'NOT_FOUND');
    }

    // API accepts totalCostRupees (e.g. ₹120.50) but strictly converts and stores integer paise (12050 paise)
    // in the database. Amounts that round to 0 paise are rejected.
    const totalCostPaise = Math.round(body.totalCostRupees * 100);
    if (totalCostPaise <= 0) {
      throw new AppError(
        400,
        'Total cost must be at least ₹0.01 (1 paisa). Amounts rounding to 0 paise are rejected.',
        'INVALID_AMOUNT'
      );
    }

    const purchasedAtDate = body.purchasedAt ? new Date(body.purchasedAt) : new Date();
    const receivedAtDate = body.isReceived ? new Date() : null;
    const sanitizedSupplier = body.supplier ? sanitizeUserText(body.supplier, 190) : null;
    const sanitizedNotes = body.notes ? sanitizeUserText(body.notes, 500) : null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase
      const purchase = await tx.purchase.create({
        data: {
          ingredientId: ingredient.id,
          quantity: body.quantity,
          unit: body.unit,
          totalCost: totalCostPaise,
          supplier: sanitizedSupplier,
          notes: sanitizedNotes,
          purchasedById: staff.id,
          purchasedAt: purchasedAtDate,
          receivedAt: receivedAtDate,
        },
      });

      // 2. If received, update ingredient status to IN_STOCK; if not received and currently OUT_OF_STOCK, set ORDERED
      let nextStatus = ingredient.stockStatus;
      if (body.isReceived) {
        nextStatus = 'IN_STOCK';
      } else if (ingredient.stockStatus === 'OUT_OF_STOCK') {
        nextStatus = 'ORDERED';
      }

      if (nextStatus !== ingredient.stockStatus) {
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stockStatus: nextStatus },
        });

        await tx.stockEvent.create({
          data: {
            ingredientId: ingredient.id,
            changedById: staff.id,
            fromStatus: ingredient.stockStatus,
            toStatus: nextStatus,
            reason: `Purchase recorded by ${staff.name} (Purchase #${purchase.id})`,
          },
        });
      }

      return { purchase, nextStatus };
    });

    if (result.nextStatus !== ingredient.stockStatus) {
      await syncAvailabilityForIngredient(ingredient.id);
    }

    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'PURCHASE_CREATED',
      entityType: 'Purchase',
      entityId: result.purchase.id,
      metadata: {
        ingredientName: ingredient.name,
        quantity: body.quantity,
        unit: body.unit,
        totalCostPaise,
        supplier: sanitizedSupplier,
        isReceived: !!body.isReceived,
      },
    });

    return NextResponse.json({ success: true, purchase: result.purchase }, { status: 201 });
});
