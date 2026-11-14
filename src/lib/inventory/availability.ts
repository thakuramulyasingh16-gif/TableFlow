import { Ingredient, Prisma, RecipeItem, StockStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface DishAvailabilityResult {
  isAvailable: boolean;
  hasOptionalWarning: boolean;
  isOverridden: boolean;
  overrideReason: string | null;
  missingRequiredIngredients: { id: number; name: string; stockStatus: StockStatus }[];
  missingOptionalIngredients: { id: number; name: string; stockStatus: StockStatus }[];
}

export function evaluateDishAvailability(
  item: {
    archivedAt?: Date | null;
    isAvailableOverride?: boolean | null;
    overrideReason?: string | null;
    isAvailable?: boolean;
    recipeItems?: (RecipeItem & { ingredient: Ingredient })[];
  }
): DishAvailabilityResult {
  // If soft-deleted, it is never available
  if (item.archivedAt) {
    return {
      isAvailable: false,
      hasOptionalWarning: false,
      isOverridden: false,
      overrideReason: null,
      missingRequiredIngredients: [],
      missingOptionalIngredients: [],
    };
  }

  // Manager temporary override takes precedence if set
  if (item.isAvailableOverride !== null && item.isAvailableOverride !== undefined) {
    return {
      isAvailable: item.isAvailableOverride,
      hasOptionalWarning: false,
      isOverridden: true,
      overrideReason: item.overrideReason || 'Manager override',
      missingRequiredIngredients: [],
      missingOptionalIngredients: [],
    };
  }

  const recipe = item.recipeItems || [];

  // If dish has no ingredients configured yet, fall back to base isAvailable flag or default to true
  if (recipe.length === 0) {
    return {
      isAvailable: item.isAvailable ?? true,
      hasOptionalWarning: false,
      isOverridden: false,
      overrideReason: null,
      missingRequiredIngredients: [],
      missingOptionalIngredients: [],
    };
  }

  const missingRequired: { id: number; name: string; stockStatus: StockStatus }[] = [];
  const missingOptional: { id: number; name: string; stockStatus: StockStatus }[] = [];

  for (const r of recipe) {
    const ing = r.ingredient;
    // IN_STOCK is the ONLY status that counts as available. ORDERED or OUT_OF_STOCK is unavailable.
    if (ing.stockStatus !== StockStatus.IN_STOCK) {
      if (r.isOptional) {
        missingOptional.push({ id: ing.id, name: ing.name, stockStatus: ing.stockStatus });
      } else {
        missingRequired.push({ id: ing.id, name: ing.name, stockStatus: ing.stockStatus });
      }
    }
  }

  const isAvailable = missingRequired.length === 0;
  const hasOptionalWarning = missingOptional.length > 0;

  return {
    isAvailable,
    hasOptionalWarning,
    isOverridden: false,
    overrideReason: null,
    missingRequiredIngredients: missingRequired,
    missingOptionalIngredients: missingOptional,
  };
}

/**
 * Recalculates and persists the availability status for a single menu item in the database.
 */
export async function recalculateMenuItemAvailability(
  menuItemId: number,
  client: DbClient = prisma
): Promise<DishAvailabilityResult> {
  const item = await client.menuItem.findUnique({
    where: { id: menuItemId },
    include: {
      recipeItems: {
        include: { ingredient: true },
      },
    },
  });

  if (!item) {
    throw new Error(`Menu item #${menuItemId} not found`);
  }

  const result = evaluateDishAvailability(item);

  // Sync to database if changed
  if (item.isAvailable !== result.isAvailable) {
    await client.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable: result.isAvailable },
    });
  }

  return result;
}

/**
 * Returns all active (non-archived) menu items that use the given ingredient.
 */
export async function getDishesUsingIngredient(ingredientId: number, client: DbClient = prisma) {
  const recipeItems = await client.recipeItem.findMany({
    where: {
      ingredientId,
      menuItem: { archivedAt: null },
    },
    include: {
      menuItem: {
        select: {
          id: true,
          name: true,
          isAvailable: true,
          basePricePaise: true,
        },
      },
    },
    orderBy: { menuItem: { name: 'asc' } },
  });

  return recipeItems.map((r) => ({
    id: r.menuItem.id,
    name: r.menuItem.name,
    isOptional: r.isOptional,
    quantityPerServing: r.quantityPerServing ? Number(r.quantityPerServing) : null,
    unit: r.unit,
  }));
}

/**
 * Recalculates availability for all menu items that use a specific ingredient,
 * updates the database, and returns the affected dish names.
 */
export async function syncAvailabilityForIngredient(
  ingredientId: number,
  client: DbClient = prisma
): Promise<{
  affectedDishes: string[];
  dishCount: number;
}> {
  const dishes = await getDishesUsingIngredient(ingredientId, client);
  const affectedDishes: string[] = [];

  for (const d of dishes) {
    await recalculateMenuItemAvailability(d.id, client);
    affectedDishes.push(d.name);
  }

  return { affectedDishes, dishCount: dishes.length };
}

/**
 * Full system recalculation of all menu item availability states.
 */
export async function recalculateAllAvailabilities(): Promise<number> {
  const items = await prisma.menuItem.findMany({
    where: { archivedAt: null },
    include: {
      recipeItems: {
        include: { ingredient: true },
      },
    },
  });

  let changedCount = 0;
  for (const item of items) {
    const result = evaluateDishAvailability(item);
    if (item.isAvailable !== result.isAvailable) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { isAvailable: result.isAvailable },
      });
      changedCount++;
    }
  }

  return changedCount;
}
