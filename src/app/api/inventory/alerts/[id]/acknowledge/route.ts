import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { syncAvailabilityForIngredient } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';
import { sanitizeUserText } from '@/lib/sanitize';
import { acknowledgeAlertSchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth<{ id: string }>(['manager', 'owner'], async (req, { params, actor: staff }) => {
  const { id: rawId } = await params;
    const alertId = parseInt(rawId, 10);
    if (isNaN(alertId) || alertId <= 0) {
      throw new AppError(400, 'Invalid alert ID', 'INVALID_ID');
    }

    const body = await parseJsonBody(req, acknowledgeAlertSchema);

    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
      include: { ingredient: true, purchases: true },
    });

    if (!alert) {
      throw new AppError(404, 'Stock alert not found', 'NOT_FOUND');
    }

    // Idempotency: If alert is already acknowledged or resolved, return existing data
    if (alert.status !== 'OPEN') {
      return NextResponse.json({
        success: true,
        message: `Alert is already ${alert.status}`,
        alert,
        purchase: alert.purchases[0] || null,
      });
    }

    // Convert rupees to integer paise; reject amounts rounding to 0 paise
    const totalCostPaise = Math.round(body.totalCostRupees * 100);
    if (totalCostPaise <= 0) {
      throw new AppError(
        400,
        'Total cost must be at least ₹0.01 (1 paisa). Amounts rounding to 0 paise are rejected.',
        'INVALID_AMOUNT'
      );
    }

    const purchasedAtDate = body.purchasedAt ? new Date(body.purchasedAt) : new Date();
    const sanitizedSupplier = body.supplier ? sanitizeUserText(body.supplier, 190) : null;
    const sanitizedNotes = body.notes ? sanitizeUserText(body.notes, 500) : null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase record in integer paise
      const purchase = await tx.purchase.create({
        data: {
          ingredientId: alert.ingredientId,
          alertId: alert.id,
          quantity: body.quantity,
          unit: body.unit,
          totalCost: totalCostPaise,
          supplier: sanitizedSupplier,
          notes: sanitizedNotes,
          purchasedById: staff.id,
          purchasedAt: purchasedAtDate,
        },
      });

      // 2. Update Ingredient status to ORDERED
      const prevStatus = alert.ingredient.stockStatus;
      await tx.ingredient.update({
        where: { id: alert.ingredientId },
        data: { stockStatus: 'ORDERED' },
      });

      // 3. Log StockEvent
      await tx.stockEvent.create({
        data: {
          ingredientId: alert.ingredientId,
          changedById: staff.id,
          fromStatus: prevStatus,
          toStatus: 'ORDERED',
          reason: `Stock ordered by ${staff.name} (Purchase #${purchase.id})`,
        },
      });

      // 4. Update StockAlert status to ACKNOWLEDGED
      const updatedAlert = await tx.stockAlert.update({
        where: { id: alert.id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedById: staff.id,
          acknowledgedAt: new Date(),
        },
        include: {
          ingredient: true,
          purchases: true,
        },
      });

      return { purchase, updatedAlert };
    });

    // 5. Synchronize availability on affected dishes
    await syncAvailabilityForIngredient(alert.ingredientId);

    // 6. Audit log
    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'STOCK_ALERT_ACKNOWLEDGED',
      entityType: 'StockAlert',
      entityId: alert.id,
      metadata: {
        ingredientName: alert.ingredient.name,
        purchaseId: result.purchase.id,
        totalCostPaise,
        quantity: body.quantity,
        unit: body.unit,
      },
    });

    // 7. Broadcast realtime update (sanitized, no staff names)
    await broadcastRealtime('inventory', 'INVENTORY_ALERT_ACKNOWLEDGED', {
      alertId: alert.id,
      ingredientName: alert.ingredient.name,
      actorRole: staff.role,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      alert: result.updatedAlert,
      purchase: result.purchase,
    });
});
