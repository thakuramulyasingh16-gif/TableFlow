import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { getDishesUsingIngredient, syncAvailabilityForIngredient } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, toggleStockStatusSchema } from '@/lib/validators';

export const POST = withStaffAuth<{ id: string }>(['chef', 'manager', 'owner'], async (req, { params, actor: staff }) => {
  await enforceRateLimit('stock_toggle', `${getClientIp(req)}:${staff.id}`);

  const { id: rawId } = await params;
    const ingredientId = parseInt(rawId, 10);
    if (isNaN(ingredientId) || ingredientId <= 0) {
      throw new AppError(400, 'Invalid ingredient ID', 'INVALID_ID');
    }

    const body = await parseJsonBody(req, toggleStockStatusSchema);
    const newStatus = body.stockStatus;
    const reason = body.reason ? sanitizeUserText(body.reason, 255) : null;

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId, archivedAt: null },
    });

    if (!ingredient) {
      throw new AppError(404, 'Ingredient not found', 'NOT_FOUND');
    }

    // Idempotency: If status is already what was requested, return early
    if (ingredient.stockStatus === newStatus) {
      const dishes = await getDishesUsingIngredient(ingredient.id);
      return NextResponse.json({
        success: true,
        ingredient,
        affectedDishes: dishes.map((d) => d.name),
        alertCreated: false,
      });
    }

    const previousStatus = ingredient.stockStatus;

    // Run status update, event logging, and alert management inside transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update ingredient stock status
      const updated = await tx.ingredient.update({
        where: { id: ingredient.id },
        data: { stockStatus: newStatus },
      });

      // 2. Log stock event audit trail
      await tx.stockEvent.create({
        data: {
          ingredientId: ingredient.id,
          changedById: staff.id,
          fromStatus: previousStatus,
          toStatus: newStatus,
          reason,
        },
      });

      // 3. Find all dishes using this ingredient
      const dishes = await tx.recipeItem.findMany({
        where: {
          ingredientId: ingredient.id,
          menuItem: { archivedAt: null },
        },
        include: { menuItem: { select: { name: true } } },
      });
      const affectedDishNames = dishes.map((d) => d.menuItem.name);

      let createdAlertId: number | null = null;

      // If moving to OUT_OF_STOCK, create an OPEN alert if none is currently active
      if (newStatus === 'OUT_OF_STOCK') {
        const existingOpen = await tx.stockAlert.findFirst({
          where: {
            ingredientId: ingredient.id,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
        });

        if (!existingOpen) {
          const alert = await tx.stockAlert.create({
            data: {
              ingredientId: ingredient.id,
              raisedById: staff.id,
              status: 'OPEN',
              affectedDishes: affectedDishNames,
            },
          });
          createdAlertId = alert.id;
        }
      }

      // If moving to IN_STOCK, resolve any OPEN or ACKNOWLEDGED alerts for this ingredient
      if (newStatus === 'IN_STOCK') {
        await tx.stockAlert.updateMany({
          where: {
            ingredientId: ingredient.id,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          data: {
            status: 'RESOLVED',
            resolvedById: staff.id,
            resolvedAt: new Date(),
          },
        });
      }

      return {
        updated,
        affectedDishNames,
        alertCreated: createdAlertId !== null,
        createdAlertId,
      };
    });

    // 4. Synchronize availability on all dishes using this ingredient
    await syncAvailabilityForIngredient(ingredient.id);

    // 5. Audit Log
    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'STOCK_STATUS_CHANGED',
      entityType: 'Ingredient',
      entityId: ingredient.id,
      metadata: {
        from: previousStatus,
        to: newStatus,
        reason,
        affectedDishes: result.affectedDishNames,
        alertCreated: result.alertCreated,
      },
    });

    // 6. Broadcast Realtime Updates to staff channel
    await broadcastRealtime('staff', 'INVENTORY_STOCK_CHANGED', {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      fromStatus: previousStatus,
      toStatus: newStatus,
      affectedDishes: result.affectedDishNames,
      changedBy: staff.name,
      role: staff.role,
      alertCreated: result.alertCreated,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      ingredient: result.updated,
      affectedDishes: result.affectedDishNames,
      alertCreated: result.alertCreated,
      createdAlertId: result.createdAlertId,
    });
});
