import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { recalculateMenuItemAvailability } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { parseJsonBody, saveRecipeSchema } from '@/lib/validators';

export const POST = withStaffAuth(['manager', 'owner'], async (req, { actor: staff }) => {
  const body = await parseJsonBody(req, saveRecipeSchema);

    const dish = await prisma.menuItem.findUnique({
      where: { id: body.menuItemId, archivedAt: null },
    });

    if (!dish) {
      throw new AppError(404, 'Dish not found', 'NOT_FOUND');
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete existing recipe items for this dish
      await tx.recipeItem.deleteMany({
        where: { menuItemId: dish.id },
      });

      // 2. Insert new recipe items (handling inline ingredient creation)
      for (const item of body.items) {
        let ingId = item.ingredientId;

        // Inline create ingredient if newIngredientName is provided
        if (!ingId && item.newIngredientName) {
          const trimmedName = item.newIngredientName.trim();
          let ing = await tx.ingredient.findUnique({ where: { name: trimmedName } });
          if (!ing) {
            ing = await tx.ingredient.create({
              data: {
                name: trimmedName,
                unit: item.unit,
                stockStatus: 'IN_STOCK',
              },
            });
          }
          ingId = ing.id;
        }

        if (!ingId) {
          throw new AppError(400, 'Each recipe item must reference an ingredient or provide a new name.', 'MISSING_INGREDIENT');
        }

        await tx.recipeItem.create({
          data: {
            menuItemId: dish.id,
            ingredientId: ingId,
            quantityPerServing: item.quantityPerServing != null ? item.quantityPerServing : null,
            unit: item.unit,
            isOptional: !!item.isOptional,
          },
        });
      }
    });

    // 3. Recalculate dish availability
    const avail = await recalculateMenuItemAvailability(dish.id);

    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'RECIPE_UPDATED',
      entityType: 'MenuItem',
      entityId: dish.id,
      metadata: {
        dishName: dish.name,
        ingredientCount: body.items.length,
        isAvailableNow: avail.isAvailable,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Recipe for "${dish.name}" saved successfully.`,
      availability: avail,
    });
});
