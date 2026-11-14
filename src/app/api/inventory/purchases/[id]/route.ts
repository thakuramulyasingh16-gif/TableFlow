import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { editPurchaseSchema, parseJsonBody } from '@/lib/validators';

export const PATCH = withStaffAuth<{ id: string }>(['manager', 'owner'], async (req, { params, actor: staff }) => {
  const { id: rawId } = await params;
    const purchaseId = parseInt(rawId, 10);
    if (isNaN(purchaseId) || purchaseId <= 0) {
      throw new AppError(400, 'Invalid purchase ID', 'INVALID_ID');
    }

    const body = await parseJsonBody(req, editPurchaseSchema);

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { ingredient: true },
    });

    if (!purchase) {
      throw new AppError(404, 'Purchase record not found', 'NOT_FOUND');
    }

    const updates: Record<string, unknown> = {};

    if (body.quantity !== undefined) {
      updates.quantity = body.quantity;
    }
    if (body.unit !== undefined) {
      updates.unit = body.unit;
    }
    if (body.totalCostRupees !== undefined) {
      // API accepts totalCostRupees (e.g. ₹120.50) but strictly converts and stores integer paise (12050 paise)
      const paise = Math.round(body.totalCostRupees * 100);
      if (paise <= 0) {
        throw new AppError(
          400,
          'Total cost must be at least ₹0.01 (1 paisa). Amounts rounding to 0 paise are rejected.',
          'INVALID_AMOUNT'
        );
      }
      updates.totalCost = paise;
    }
    if (body.supplier !== undefined) {
      updates.supplier = body.supplier ? sanitizeUserText(body.supplier, 190) : null;
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes ? sanitizeUserText(body.notes, 500) : null;
    }

    const updated = await prisma.purchase.update({
      where: { id: purchase.id },
      data: updates,
    });

    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'PURCHASE_UPDATED',
      entityType: 'Purchase',
      entityId: purchase.id,
      metadata: {
        reason: sanitizeUserText(body.reason, 255),
        changes: updates,
        previous: {
          quantity: Number(purchase.quantity),
          unit: purchase.unit,
          totalCost: purchase.totalCost,
          supplier: purchase.supplier,
        },
      },
    });

    return NextResponse.json({ success: true, purchase: updated });
});
