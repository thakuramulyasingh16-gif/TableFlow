import { AppError } from '../utils/AppError.js';
import { sanitizeUserText } from '../utils/sanitize.js';

export function isDealCurrentlyValid(deal, now = new Date()) {
  if (!deal || !deal.is_active) return false;
  if (deal.starts_at && new Date(deal.starts_at) > now) return false;
  if (deal.ends_at && new Date(deal.ends_at) < now) return false;
  return true;
}

export function calculateDiscountPaise({ deal, lineItems, subtotalPaise, now = new Date() }) {
  if (!deal) return 0;
  if (!isDealCurrentlyValid(deal, now)) {
    throw new AppError(400, 'Selected deal is not active or has expired.', 'DEAL_INVALID');
  }

  const eligibleSubtotal = deal.applicable_category_id
    ? lineItems
        .filter((li) => li.categoryId === deal.applicable_category_id)
        .reduce((acc, li) => acc + li.lineTotalPaise, 0)
    : subtotalPaise;

  if (subtotalPaise < (deal.min_order_paise || 0)) {
    throw new AppError(
      400,
      `Minimum order of ₹${((deal.min_order_paise || 0) / 100).toFixed(2)} required for this deal.`,
      'DEAL_MIN_NOT_MET'
    );
  }

  let discount = 0;
  if (deal.discount_type === 'percent') {
    discount = Math.round((eligibleSubtotal * Math.min(deal.discount_value, 100)) / 100);
  } else if (deal.discount_type === 'flat_paise') {
    discount = deal.discount_value;
  }

  return Math.min(discount, eligibleSubtotal, subtotalPaise);
}

export function calculateOrderPricing({
  requestedItems,
  menuItemsMap,
  variantsMap,
  deal = null,
  cgstBps = 250,
  sgstBps = 250,
  tipPaise = 0,
  now = new Date(),
}) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new AppError(400, 'Order must contain at least one item.', 'EMPTY_ORDER');
  }

  const resolvedItems = [];
  let subtotalPaise = 0;

  for (const reqItem of requestedItems) {
    const menuItem = menuItemsMap.get(reqItem.menuItemId);
    if (!menuItem || !menuItem.is_available) {
      throw new AppError(400, `Menu item #${reqItem.menuItemId} is unavailable.`, 'ITEM_UNAVAILABLE');
    }

    let variant = null;
    if (reqItem.variantId != null) {
      variant = variantsMap.get(reqItem.variantId);
      if (!variant || variant.menu_item_id !== menuItem.id || !variant.is_available) {
        throw new AppError(400, `Selected option for ${menuItem.name} is unavailable.`, 'VARIANT_UNAVAILABLE');
      }
    }

    const unitPricePaise = Math.max(0, menuItem.base_price_paise + (variant ? variant.price_delta_paise : 0));
    const quantity = reqItem.quantity;
    const lineTotalPaise = unitPricePaise * quantity;
    subtotalPaise += lineTotalPaise;

    resolvedItems.push({
      menuItemId: menuItem.id,
      variantId: variant ? variant.id : null,
      stationId: menuItem.station_id,
      categoryId: menuItem.category_id,
      itemNameSnapshot: menuItem.name,
      variantNameSnapshot: variant ? variant.name : null,
      unitPricePaise,
      quantity,
      lineTotalPaise,
      specialInstructions: reqItem.specialInstructions
        ? sanitizeUserText(reqItem.specialInstructions, 250)
        : null,
    });
  }

  const discountPaise = calculateDiscountPaise({
    deal,
    lineItems: resolvedItems,
    subtotalPaise,
    now,
  });

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
