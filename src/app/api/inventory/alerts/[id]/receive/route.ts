import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { syncAvailabilityForIngredient } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';

export const POST = withStaffAuth<{ id: string }>(['chef', 'manager', 'owner'], async (req, { params, actor: staff }) => {
  const { id: rawId } = await params;
    const alertId = parseInt(rawId, 10);
    if (isNaN(alertId) || alertId <= 0) {
      throw new AppError(400, 'Invalid alert ID', 'INVALID_ID');
    }

    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
      include: { ingredient: true, purchases: true },
    });

    if (!alert) {
      throw new AppError(404, 'Stock alert not found', 'NOT_FOUND');
    }

    // Idempotency: If already resolved, return early
    if (alert.status === 'RESOLVED') {
      return NextResponse.json({
        success: true,
        message: 'Alert has already been resolved.',
        alert,
      });
    }

    const prevStatus = alert.ingredient.stockStatus;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark ingredient IN_STOCK
      const updatedIngredient = await tx.ingredient.update({
        where: { id: alert.ingredientId },
        data: { stockStatus: 'IN_STOCK' },
      });

      // 2. Mark any linked unreceived purchases as received
      await tx.purchase.updateMany({
        where: {
          ingredientId: alert.ingredientId,
          receivedAt: null,
        },
        data: { receivedAt: now },
      });

      // 3. Mark alert RESOLVED
      const updatedAlert = await tx.stockAlert.update({
        where: { id: alert.id },
        data: {
          status: 'RESOLVED',
          resolvedById: staff.id,
          resolvedAt: now,
        },
        include: {
          ingredient: true,
          purchases: true,
        },
      });

      // 4. Log StockEvent
      await tx.stockEvent.create({
        data: {
          ingredientId: alert.ingredientId,
          changedById: staff.id,
          fromStatus: prevStatus,
          toStatus: 'IN_STOCK',
          reason: `Stock arrival marked received by ${staff.name} (${staff.role})`,
        },
      });

      return { updatedIngredient, updatedAlert };
    });

    // 5. Synchronize availability on all dishes using this ingredient (they become available again!)
    const { affectedDishes } = await syncAvailabilityForIngredient(alert.ingredientId);

    // 6. Audit log
    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'STOCK_RECEIVED_AND_RESOLVED',
      entityType: 'StockAlert',
      entityId: alert.id,
      metadata: {
        ingredientName: alert.ingredient.name,
        resolvedBy: staff.name,
        role: staff.role,
        affectedDishes,
      },
    });

    // 7. Broadcast realtime event
    await broadcastRealtime('staff', 'INVENTORY_STOCK_RECEIVED', {
      alertId: alert.id,
      ingredientId: alert.ingredientId,
      ingredientName: alert.ingredient.name,
      receivedBy: staff.name,
      affectedDishes,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      alert: result.updatedAlert,
      affectedDishes,
    });
});
