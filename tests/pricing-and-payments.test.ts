import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderPricing } from '../src/lib/pricing';

test('calculateOrderPricing computes variants, deals, CGST, SGST, and total server-side in integer paise', () => {
  const menuItemsMap = new Map([
    [
      1,
      {
        id: 1,
        categoryId: 1,
        stationId: 1,
        name: 'Smoked Paneer Tikka',
        description: null,
        imageUrl: null,
        basePricePaise: 32000,
        isVeg: true,
        spiceLevel: 'medium' as const,
        allergens: [],
        isAvailable: true,
        prepTimeMins: 15,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    [
      2,
      {
        id: 2,
        categoryId: 3,
        stationId: 1,
        name: 'Garlic Naan',
        description: null,
        imageUrl: null,
        basePricePaise: 9500,
        isVeg: true,
        spiceLevel: 'none' as const,
        allergens: [],
        isAvailable: true,
        prepTimeMins: 7,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);

  const variantsMap = new Map([
    [
      10,
      {
        id: 10,
        menuItemId: 1,
        name: 'Platter (10 pcs)',
        priceDeltaPaise: 14000,
        isDefault: false,
        isAvailable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);

  const deal = {
    id: 1,
    title: '10% Off',
    description: null,
    code: 'WELCOME10',
    discountType: 'percent' as const,
    discountValue: 10,
    minOrderPaise: 49900,
    applicableCategoryId: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    maxRedemptions: null,
    perSessionLimit: 1,
    perTableLimit: null,
    isOneTime: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = calculateOrderPricing({
    requestedItems: [
      { menuItemId: 1, variantId: 10, quantity: 1, specialInstructions: '<b>No cilantro</b>' },
      { menuItemId: 2, variantId: null, quantity: 2 },
    ],
    menuItemsMap,
    variantsMap,
    deal,
    cgstBps: 250,
    sgstBps: 250,
  });

  assert.equal(result.subtotalPaise, 65000);
  assert.equal(result.discountPaise, 6500);
  assert.equal(result.cgstPaise, 1463);
  assert.equal(result.sgstPaise, 1463);
  assert.equal(result.totalPaise, 61426);
  assert.equal(result.resolvedItems[0].specialInstructions, 'No cilantro');
});

test('calculateOrderPricing rejects unavailable menu items', () => {
  const menuItemsMap = new Map([
    [
      1,
      {
        id: 1,
        categoryId: 1,
        stationId: 1,
        name: 'Sold Out',
        description: null,
        imageUrl: null,
        basePricePaise: 15000,
        isVeg: true,
        spiceLevel: 'none' as const,
        allergens: [],
        isAvailable: false,
        prepTimeMins: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);

  assert.throws(
    () =>
      calculateOrderPricing({
        requestedItems: [{ menuItemId: 1, quantity: 1 }],
        menuItemsMap,
        variantsMap: new Map(),
      }),
    (err: { code?: string }) => err.code === 'ITEM_UNAVAILABLE'
  );
});
