import { Prisma } from '@prisma/client';
import { syncAvailabilityForIngredient } from './availability';

export interface DeductionResult {
  ingredientId: number;
  ingredientName: string;
  previousStock: number;
  deductedAmount: number;
  newStock: number;
  lowStockThreshold: number;
  alertRaised: boolean;
  statusChangedToOutOfStock: boolean;
}

/**
 * Deducts ingredient quantities for all items in an order upon confirmation.
 * Runs atomically within the order confirmation transaction.
 * If currentStock falls below lowStockThreshold, raises an automated StockAlert.
 * If currentStock reaches 0, updates stockStatus to OUT_OF_STOCK and triggers dish availability sync.
 */
export async function deductInventoryForConfirmedOrder({
  orderId,
  actorUserId,
  tx,
}: {
  orderId: number;
  actorUserId: number;
  actorRole?: string;
  tx: Prisma.TransactionClient;
}): Promise<DeductionResult[]> {
  // 1. Fetch order items with their menu item recipes and ingredients
  const orderItems = await tx.orderItem.findMany({
    where: { orderId },
    include: {
      menuItem: {
        include: {
          recipeItems: {
            include: {
              ingredient: true,
            },
          },
        },
      },
    },
  });

  // Aggregate deductions per ingredient across all items in the order
  const ingredientDeductions = new Map<
    number,
    {
      ingredient: {
        id: number;
        name: string;
        currentStock: Prisma.Decimal | null;
        lowStockThreshold: Prisma.Decimal | null;
        stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED';
      };
      totalQty: number;
    }
  >();

  for (const item of orderItems) {
    if (!item.menuItem?.recipeItems) continue;
    for (const recipe of item.menuItem.recipeItems) {
      if (!recipe.ingredient || recipe.isOptional) continue;
      if (!recipe.quantityPerServing || Number(recipe.quantityPerServing) <= 0) continue;

      const perServing = Number(recipe.quantityPerServing);
      const needed = Math.round(perServing * item.quantity * 1000) / 1000;
      const ingId = recipe.ingredient.id;

      if (ingredientDeductions.has(ingId)) {
        const existing = ingredientDeductions.get(ingId)!;
        existing.totalQty = Math.round((existing.totalQty + needed) * 1000) / 1000;
      } else {
        ingredientDeductions.set(ingId, {
          ingredient: recipe.ingredient,
          totalQty: needed,
        });
      }
    }
  }

  const results: DeductionResult[] = [];

  for (const [ingId, { ingredient, totalQty }] of ingredientDeductions.entries()) {
    const currentStock = Number(ingredient.currentStock ?? 0);
    const threshold = Number(ingredient.lowStockThreshold ?? 0);
    const newStock = Math.max(0, Math.round((currentStock - totalQty) * 1000) / 1000);

    let statusChangedToOutOfStock = false;
    let nextStatus = ingredient.stockStatus;

    if (newStock <= 0 && ingredient.stockStatus === 'IN_STOCK') {
      nextStatus = 'OUT_OF_STOCK';
      statusChangedToOutOfStock = true;
    }

    // Update ingredient currentStock & stockStatus
    await tx.ingredient.update({
      where: { id: ingId },
      data: {
        currentStock: new Prisma.Decimal(newStock),
        stockStatus: nextStatus,
      },
    });

    let alertRaised = false;

    // Check if newStock fell below lowStockThreshold and no open alert exists
    if (newStock <= threshold) {
      const existingOpenAlert = await tx.stockAlert.findFirst({
        where: { ingredientId: ingId, status: 'OPEN' },
      });

      if (!existingOpenAlert) {
        // Find affected dishes
        const affectedRecipeItems = await tx.recipeItem.findMany({
          where: { ingredientId: ingId, isOptional: false },
          include: { menuItem: { select: { id: true, name: true } } },
        });
        const affectedDishes = affectedRecipeItems.map((r) => ({
          id: r.menuItem.id,
          name: r.menuItem.name,
        }));

        await tx.stockAlert.create({
          data: {
            ingredientId: ingId,
            raisedById: actorUserId,
            status: 'OPEN',
            affectedDishes,
          },
        });
        alertRaised = true;
      }
    }

    if (statusChangedToOutOfStock) {
      // Record stock event
      await tx.stockEvent.create({
        data: {
          ingredientId: ingId,
          changedById: actorUserId,
          fromStatus: ingredient.stockStatus,
          toStatus: 'OUT_OF_STOCK',
          reason: `Auto-deducted to 0 upon confirmation of order #${orderId}`,
        },
      });

      // Synchronize dish availability in transaction
      await syncAvailabilityForIngredient(ingId, tx);
    }

    results.push({
      ingredientId: ingId,
      ingredientName: ingredient.name,
      previousStock: currentStock,
      deductedAmount: totalQty,
      newStock,
      lowStockThreshold: threshold,
      alertRaised,
      statusChangedToOutOfStock,
    });
  }

  return results;
}
