import { Deal, ItemVariant, MenuItem } from '@prisma/client';
import { AppError } from './api-error';
import { sanitizeUserText } from './sanitize';

export interface RequestedOrderItem {
  menuItemId: number;
  variantId?: number | null;
  quantity: number;
  specialInstructions?: string;
}

export interface ResolvedOrderItem {
  menuItemId: number;
  variantId: number | null;
  stationId: number;
  categoryId: number;
  itemNameSnapshot: string;
  variantNameSnapshot: string | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  specialInstructions: string | null;
}

export interface PricingResult {
  resolvedItems: ResolvedOrderItem[];
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  tipPaise: number;
  totalPaise: number;
}

export function isDealCurrentlyValid(deal: Deal | null, now = new Date()): boolean {
  if (!deal || !deal.isActive) return false;
  if (deal.startsAt && deal.startsAt > now) return false;
  if (deal.endsAt && deal.endsAt < now) return false;
  return true;
}

export function calculateDiscountPaise({
  deal,
  lineItems,
  subtotalPaise,
  now = new Date(),
}: {
  deal: Deal | null;
  lineItems: ResolvedOrderItem[];
  subtotalPaise: number;
  now?: Date;
}): number {
  if (!deal) return 0;
  if (!isDealCurrentlyValid(deal, now)) {
    throw new AppError(400, 'Selected deal is not active or has expired.', 'DEAL_INVALID');
  }

  const eligibleSubtotal = deal.applicableCategoryId
    ? lineItems
        .filter((li) => li.categoryId === deal.applicableCategoryId)
        .reduce((acc, li) => acc + li.lineTotalPaise, 0)
    : subtotalPaise;

  if (subtotalPaise < (deal.minOrderPaise || 0)) {
    throw new AppError(
      400,
      `Minimum order of ₹${((deal.minOrderPaise || 0) / 100).toFixed(2)} required for this deal.`,
      'DEAL_MIN_NOT_MET'
    );
  }

  let discount = 0;
  if (deal.discountType === 'percent') {
    discount = Math.round((eligibleSubtotal * Math.min(deal.discountValue, 100)) / 100);
  } else if (deal.discountType === 'flat_paise') {
    discount = deal.discountValue;
  }

  return Math.min(discount, eligibleSubtotal, subtotalPaise);
}

export type MenuItemLike = Pick<
  MenuItem,
  'id' | 'name' | 'basePricePaise' | 'isAvailable' | 'stationId' | 'categoryId'
> &
  Partial<MenuItem>;

export function calculateOrderPricing({
  requestedItems,
  menuItemsMap,
  variantsMap,
  deal = null,
  cgstBps = 250,
  sgstBps = 250,
  tipPaise = 0,
  now = new Date(),
}: {
  requestedItems: RequestedOrderItem[];
  menuItemsMap: Map<number, MenuItemLike>;
  variantsMap: Map<number, ItemVariant>;
  deal?: Deal | null;
  cgstBps?: number;
  sgstBps?: number;
  tipPaise?: number;
  now?: Date;
}): PricingResult {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new AppError(400, 'Order must contain at least one item.', 'EMPTY_ORDER');
  }

  const resolvedItems: ResolvedOrderItem[] = [];
  let subtotalPaise = 0;

  for (const reqItem of requestedItems) {
    const menuItem = menuItemsMap.get(reqItem.menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      throw new AppError(400, `Menu item #${reqItem.menuItemId} is unavailable.`, 'ITEM_UNAVAILABLE');
    }

    let variant: ItemVariant | null = null;
    if (reqItem.variantId != null) {
      variant = variantsMap.get(reqItem.variantId) || null;
      if (!variant || variant.menuItemId !== menuItem.id || !variant.isAvailable) {
        throw new AppError(400, `Selected option for ${menuItem.name} is unavailable.`, 'VARIANT_UNAVAILABLE');
      }
    }

    const unitPricePaise = Math.max(0, menuItem.basePricePaise + (variant ? variant.priceDeltaPaise : 0));
    const lineTotalPaise = unitPricePaise * reqItem.quantity;
    subtotalPaise += lineTotalPaise;

    resolvedItems.push({
      menuItemId: menuItem.id,
      variantId: variant ? variant.id : null,
      stationId: menuItem.stationId,
      categoryId: menuItem.categoryId,
      itemNameSnapshot: menuItem.name,
      variantNameSnapshot: variant ? variant.name : null,
      unitPricePaise,
      quantity: reqItem.quantity,
      lineTotalPaise,
      specialInstructions: reqItem.specialInstructions
        ? sanitizeUserText(reqItem.specialInstructions, 250)
        : null,
    });
  }

  const discountPaise = calculateDiscountPaise({ deal, lineItems: resolvedItems, subtotalPaise, now });
  const taxablePaise = Math.max(0, subtotalPaise - discountPaise);
  const cgstPaise = Math.round((taxablePaise * cgstBps) / 10000);
  const sgstPaise = Math.round((taxablePaise * sgstBps) / 10000);
  const safeTipPaise = Math.max(0, Math.round(tipPaise || 0));
  const totalPaise = taxablePaise + cgstPaise + sgstPaise + safeTipPaise;

  return {
    resolvedItems,
    subtotalPaise,
    discountPaise,
    cgstPaise,
    sgstPaise,
    tipPaise: safeTipPaise,
    totalPaise,
  };
}

