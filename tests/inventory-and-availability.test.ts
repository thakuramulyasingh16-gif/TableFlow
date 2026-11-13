import test from 'node:test';
import assert from 'node:assert/strict';
import { StockStatus } from '@prisma/client';
import { evaluateDishAvailability } from '../src/lib/inventory/availability';
import { checkAllowedRole } from '../src/lib/rbac';
import {
  acknowledgeAlertSchema,
  createPurchaseSchema,
  overrideDishAvailabilitySchema,
  toggleStockStatusSchema,
} from '../src/lib/validators';
import { calculateOrderPricing } from '../src/lib/pricing';

test('Availability rule: dish is AVAILABLE only if all non-optional ingredients are IN_STOCK', () => {
  const dalIngredient = {
    id: 1,
    name: 'Dal',
    unit: 'kg' as const,
    stockStatus: 'IN_STOCK' as StockStatus,
    currentStock: null,
    lowStockThreshold: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  const butterIngredient = {
    id: 2,
    name: 'Butter',
    unit: 'kg' as const,
    stockStatus: 'IN_STOCK' as StockStatus,
    currentStock: null,
    lowStockThreshold: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  const creamIngredient = {
    id: 3,
    name: 'Cream',
    unit: 'l' as const,
    stockStatus: 'IN_STOCK' as StockStatus,
    currentStock: null,
    lowStockThreshold: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  const recipe = [
    {
      id: 101,
      menuItemId: 10,
      ingredientId: 1,
      quantityPerServing: null,
      unit: 'kg' as const,
      isOptional: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ingredient: dalIngredient,
    },
    {
      id: 102,
      menuItemId: 10,
      ingredientId: 2,
      quantityPerServing: null,
      unit: 'kg' as const,
      isOptional: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ingredient: butterIngredient,
    },
    {
      id: 103,
      menuItemId: 10,
      ingredientId: 3,
      quantityPerServing: null,
      unit: 'l' as const,
      isOptional: true, // Optional!
      createdAt: new Date(),
      updatedAt: new Date(),
      ingredient: creamIngredient,
    },
  ];

  // Case 1: All in stock -> Available
  const resAllIn = evaluateDishAvailability({ recipeItems: recipe });
  assert.equal(resAllIn.isAvailable, true);
  assert.equal(resAllIn.hasOptionalWarning, false);
  assert.equal(resAllIn.missingRequiredIngredients.length, 0);

  // Case 2: Required ingredient OUT_OF_STOCK -> Unavailable
  dalIngredient.stockStatus = 'OUT_OF_STOCK';
  const resRequiredOut = evaluateDishAvailability({ recipeItems: recipe });
  assert.equal(resRequiredOut.isAvailable, false);
  assert.equal(resRequiredOut.missingRequiredIngredients.length, 1);
  assert.equal(resRequiredOut.missingRequiredIngredients[0].name, 'Dal');

  // Case 3: Required ingredient ORDERED (not received yet) -> Counts as unavailable!
  dalIngredient.stockStatus = 'ORDERED';
  const resRequiredOrdered = evaluateDishAvailability({ recipeItems: recipe });
  assert.equal(resRequiredOrdered.isAvailable, false);
  assert.equal(resRequiredOrdered.missingRequiredIngredients.length, 1);

  // Case 4: Only OPTIONAL ingredient is OUT_OF_STOCK -> Dish stays AVAILABLE with warning!
  dalIngredient.stockStatus = 'IN_STOCK';
  creamIngredient.stockStatus = 'OUT_OF_STOCK';
  const resOptionalOut = evaluateDishAvailability({ recipeItems: recipe });
  assert.equal(resOptionalOut.isAvailable, true);
  assert.equal(resOptionalOut.hasOptionalWarning, true);
  assert.equal(resOptionalOut.missingOptionalIngredients.length, 1);
  assert.equal(resOptionalOut.missingOptionalIngredients[0].name, 'Cream');
});

test('Shared-ingredient propagation: marking shared ingredient out of stock disables all dependent dishes', () => {
  const sharedDal = {
    id: 1,
    name: 'Dal (Lentils)',
    unit: 'kg' as const,
    stockStatus: 'OUT_OF_STOCK' as StockStatus,
    currentStock: null,
    lowStockThreshold: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };

  // Dish A: Dal Makhni uses Dal
  const dalMakhni = {
    id: 10,
    name: 'Dal Makhni',
    recipeItems: [
      {
        id: 1,
        menuItemId: 10,
        ingredientId: 1,
        quantityPerServing: null,
        unit: 'kg' as const,
        isOptional: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ingredient: sharedDal,
      },
    ],
  };

  // Dish B: Dal Tadka also uses Dal
  const dalTadka = {
    id: 11,
    name: 'Dal Tadka',
    recipeItems: [
      {
        id: 2,
        menuItemId: 11,
        ingredientId: 1,
        quantityPerServing: null,
        unit: 'kg' as const,
        isOptional: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ingredient: sharedDal,
      },
    ],
  };

  // Both must be unavailable because shared Dal is OUT_OF_STOCK
  assert.equal(evaluateDishAvailability(dalMakhni).isAvailable, false);
  assert.equal(evaluateDishAvailability(dalTadka).isAvailable, false);

  // Once Dal arrives and becomes IN_STOCK, both become available again!
  sharedDal.stockStatus = 'IN_STOCK';
  assert.equal(evaluateDishAvailability(dalMakhni).isAvailable, true);
  assert.equal(evaluateDishAvailability(dalTadka).isAvailable, true);
});

test('Manager override and soft-delete rules', () => {
  // Soft-deleted dish is NEVER available
  const archivedDish = {
    archivedAt: new Date(),
    isAvailable: true,
    recipeItems: [],
  };
  assert.equal(evaluateDishAvailability(archivedDish).isAvailable, false);

  // Manager override forces available even if stock is out
  const overriddenDish = {
    archivedAt: null,
    isAvailableOverride: true,
    overrideReason: 'VIP tasting session',
    recipeItems: [
      {
        id: 1,
        menuItemId: 1,
        ingredientId: 1,
        quantityPerServing: null,
        unit: 'kg' as const,
        isOptional: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ingredient: {
          id: 1,
          name: 'Special Truffle',
          unit: 'kg' as const,
          stockStatus: 'OUT_OF_STOCK' as const,
          currentStock: null,
          lowStockThreshold: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          archivedAt: null,
        },
      },
    ],
  };
  const overrideRes = evaluateDishAvailability(overriddenDish);
  assert.equal(overrideRes.isAvailable, true);
  assert.equal(overrideRes.isOverridden, true);
  assert.equal(overrideRes.overrideReason, 'VIP tasting session');
});

test('Order API rejects unavailable dishes (server-authoritative)', () => {
  const menuMap = new Map([
    [
      1,
      {
        id: 1,
        name: 'Dal Makhni',
        basePricePaise: 35000,
        isAvailable: false, // Unavailable!
        stationId: 1,
        categoryId: 1,
      },
    ],
  ]);

  assert.throws(
    () => {
      calculateOrderPricing({
        requestedItems: [{ menuItemId: 1, quantity: 1 }],
        menuItemsMap: menuMap,
        variantsMap: new Map(),
      });
    },
    (err: unknown) => {
      return err instanceof Error && err.message.includes('unavailable');
    }
  );
});

test('RBAC deny-by-default for inventory actions', () => {
  // Chef can toggle stock
  assert.equal(checkAllowedRole('chef', ['chef', 'manager', 'owner']), true);

  // Chef CANNOT access manager features (reports, purchases, recipe editing, soft delete)
  assert.equal(checkAllowedRole('chef', ['manager', 'owner']), false);

  // Waiter has NO access to chef or manager inventory tools
  assert.equal(checkAllowedRole('waiter', ['chef', 'manager', 'owner']), false);
  assert.equal(checkAllowedRole('waiter', ['manager', 'owner']), false);

  // Manager and Owner have full access
  assert.equal(checkAllowedRole('manager', ['manager', 'owner']), true);
  assert.equal(checkAllowedRole('owner', ['manager', 'owner']), true);
});

test('Zod validation enforces integer paise and rejects invalid inputs', () => {
  // Valid purchase
  const validPurchase = createPurchaseSchema.safeParse({
    ingredientId: 1,
    quantity: 10.5,
    unit: 'kg',
    totalCostRupees: 2450.5,
    supplier: 'Metro Wholesale',
  });
  assert.equal(validPurchase.success, true);

  // Rejects negative cost
  const invalidCost = createPurchaseSchema.safeParse({
    ingredientId: 1,
    quantity: 10,
    unit: 'kg',
    totalCostRupees: -500,
  });
  assert.equal(invalidCost.success, false);

  // Rejects invalid unit
  const invalidUnit = createPurchaseSchema.safeParse({
    ingredientId: 1,
    quantity: 10,
    unit: 'invalid_unit',
    totalCostRupees: 500,
  });
  assert.equal(invalidUnit.success, false);

  // Rejects unknown client fields (.strict())
  const unknownField = toggleStockStatusSchema.safeParse({
    stockStatus: 'IN_STOCK',
    hackerField: true,
  });
  assert.equal(unknownField.success, false);

  // Acknowledge alert schema validation
  assert.equal(
    acknowledgeAlertSchema.safeParse({
      quantity: 5,
      unit: 'kg',
      totalCostRupees: 1250,
      supplier: 'Fresh Farms',
    }).success,
    true
  );
  assert.equal(acknowledgeAlertSchema.safeParse({}).success, false);

  // Override dish availability requires reason
  assert.equal(
    overrideDishAvailabilitySchema.safeParse({
      menuItemId: 1,
      isAvailableOverride: true,
      overrideReason: 'VIP tasting event',
    }).success,
    true
  );
  assert.equal(
    overrideDishAvailabilitySchema.safeParse({
      menuItemId: 1,
      isAvailableOverride: true,
      overrideReason: '',
    }).success,
    false
  );
});
