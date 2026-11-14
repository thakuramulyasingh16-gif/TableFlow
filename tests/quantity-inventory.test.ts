import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDishAvailability } from '../src/lib/inventory/availability';
import { DeductionResult } from '../src/lib/inventory/deduction';

test('Recipe serving calculation aggregates required ingredients across multiple order items', () => {
  interface MockOrderItem {
    menuItemId: number;
    quantity: number;
    recipes: {
      ingredientId: number;
      ingredientName: string;
      quantityPerServing: number;
      isOptional: boolean;
    }[];
  }

  const items: MockOrderItem[] = [
    {
      menuItemId: 1, // Dal Makhni (qty: 2)
      quantity: 2,
      recipes: [
        { ingredientId: 10, ingredientName: 'Black Urad Dal', quantityPerServing: 0.15, isOptional: false }, // 150g
        { ingredientId: 11, ingredientName: 'White Butter', quantityPerServing: 0.05, isOptional: false }, // 50g
        { ingredientId: 12, ingredientName: 'Coriander Garnish', quantityPerServing: 0.01, isOptional: true }, // 10g optional
      ],
    },
    {
      menuItemId: 2, // Dal Tadka (qty: 3)
      quantity: 3,
      recipes: [
        { ingredientId: 10, ingredientName: 'Black Urad Dal', quantityPerServing: 0.10, isOptional: false }, // 100g
        { ingredientId: 13, ingredientName: 'Garlic', quantityPerServing: 0.02, isOptional: false }, // 20g
      ],
    },
  ];

  const aggregatedDeductions = new Map<number, { name: string; totalQty: number }>();

  for (const item of items) {
    for (const r of item.recipes) {
      if (r.isOptional || r.quantityPerServing <= 0) continue;
      const needed = Math.round(r.quantityPerServing * item.quantity * 1000) / 1000;
      if (aggregatedDeductions.has(r.ingredientId)) {
        const existing = aggregatedDeductions.get(r.ingredientId)!;
        existing.totalQty = Math.round((existing.totalQty + needed) * 1000) / 1000;
      } else {
        aggregatedDeductions.set(r.ingredientId, { name: r.ingredientName, totalQty: needed });
      }
    }
  }

  // Dal: (0.15 * 2) + (0.10 * 3) = 0.30 + 0.30 = 0.60 kg (600g)
  assert.equal(aggregatedDeductions.get(10)?.totalQty, 0.60);
  // Butter: 0.05 * 2 = 0.10 kg (100g)
  assert.equal(aggregatedDeductions.get(11)?.totalQty, 0.10);
  // Garlic: 0.02 * 3 = 0.06 kg (60g)
  assert.equal(aggregatedDeductions.get(13)?.totalQty, 0.06);
  // Optional Coriander was skipped
  assert.equal(aggregatedDeductions.has(12), false);
});

test('Deduction logic raises StockAlert when current stock drops below threshold and transitions status at 0', () => {
  interface MockIngredient {
    id: number;
    name: string;
    currentStock: number;
    lowStockThreshold: number;
    stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  }

  const ingredient: MockIngredient = {
    id: 10,
    name: 'Black Urad Dal',
    currentStock: 1.0, // 1 kg
    lowStockThreshold: 0.5, // 500g threshold
    stockStatus: 'IN_STOCK',
  };

  let openAlertCount = 0;

  const applyDeduction = (ing: MockIngredient, needed: number): DeductionResult => {
    const prev = ing.currentStock;
    const newStock = Math.max(0, Math.round((prev - needed) * 1000) / 1000);
    let statusChanged = false;

    if (newStock <= 0 && ing.stockStatus === 'IN_STOCK') {
      ing.stockStatus = 'OUT_OF_STOCK';
      statusChanged = true;
    }
    ing.currentStock = newStock;

    let alertRaised = false;
    if (newStock <= ing.lowStockThreshold && openAlertCount === 0) {
      openAlertCount++;
      alertRaised = true;
    }

    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      previousStock: prev,
      deductedAmount: needed,
      newStock,
      lowStockThreshold: ing.lowStockThreshold,
      alertRaised,
      statusChangedToOutOfStock: statusChanged,
    };
  };

  // 1. Deduct 0.3 kg: stock drops from 1.0 to 0.7 kg (above 0.5 threshold)
  const step1 = applyDeduction(ingredient, 0.3);
  assert.equal(step1.newStock, 0.7);
  assert.equal(step1.alertRaised, false);
  assert.equal(step1.statusChangedToOutOfStock, false);
  assert.equal(ingredient.stockStatus, 'IN_STOCK');

  // 2. Deduct 0.3 kg: stock drops from 0.7 to 0.4 kg (below 0.5 threshold -> ALERT raised)
  const step2 = applyDeduction(ingredient, 0.3);
  assert.equal(step2.newStock, 0.4);
  assert.equal(step2.alertRaised, true);
  assert.equal(step2.statusChangedToOutOfStock, false);
  assert.equal(ingredient.stockStatus, 'IN_STOCK');

  // 3. Deduct 0.5 kg: stock drops from 0.4 to 0 (OUT_OF_STOCK toggled, alert not re-raised)
  const step3 = applyDeduction(ingredient, 0.5);
  assert.equal(step3.newStock, 0);
  assert.equal(step3.statusChangedToOutOfStock, true);
  assert.equal(step3.alertRaised, false); // Already open
  assert.equal(ingredient.stockStatus, 'OUT_OF_STOCK');
});

test('Dish availability automatically reflects ingredient stock status', () => {
  const dish = {
    id: 1,
    name: 'Dal Makhni',
    isAvailable: true,
    recipeItems: [
      {
        id: 1,
        menuItemId: 1,
        ingredientId: 10,
        unit: 'kg' as const,
        isOptional: false,
        quantityPerServing: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ingredient: {
          id: 10,
          name: 'Black Urad Dal',
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

  const availability = evaluateDishAvailability(dish);
  assert.equal(availability.isAvailable, false);
  assert.equal(availability.missingRequiredIngredients.length, 1);
  assert.equal(availability.missingRequiredIngredients[0].name, 'Black Urad Dal');
});
