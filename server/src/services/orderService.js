import crypto from 'node:crypto';
import { getEnv } from '../config/env.js';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';
import { sanitizeUserText } from '../utils/sanitize.js';
import { calculateOrderPricing } from './pricingService.js';

function generateOrderNumber() {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `TF-${ts}-${suffix}`;
}

export async function createGuestOrder({ tableSession, table, items, dealCode, notes, io }) {
  const { MenuItem, ItemVariant, Deal, Order, OrderItem, Table, sequelize } = getModels();
  const env = getEnv();

  const itemIds = [...new Set(items.map((i) => i.menuItemId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v) => v != null))];

  const [menuItems, variants, deal] = await Promise.all([
    MenuItem.findAll({ where: { id: itemIds } }),
    variantIds.length ? ItemVariant.findAll({ where: { id: variantIds } }) : Promise.resolve([]),
    dealCode ? Deal.findOne({ where: { code: dealCode.trim().toUpperCase() } }) : Promise.resolve(null),
  ]);

  if (dealCode && !deal) {
    throw new AppError(400, 'Promo code not found.', 'DEAL_NOT_FOUND');
  }

  const menuItemsMap = new Map(menuItems.map((m) => [m.id, m]));
  const variantsMap = new Map(variants.map((v) => [v.id, v]));

  const pricing = calculateOrderPricing({
    requestedItems: items,
    menuItemsMap,
    variantsMap,
    deal,
    cgstBps: env.CGST_BPS,
    sgstBps: env.SGST_BPS,
    tipPaise: 0,
  });

  const sanitizedNotes = notes ? sanitizeUserText(notes, 500) : null;

  const createdOrder = await sequelize.transaction(async (transaction) => {
    const order = await Order.create(
      {
        order_number: generateOrderNumber(),
        table_id: table.id,
        table_session_id: tableSession.id,
        deal_id: deal ? deal.id : null,
        status: 'received',
        subtotal_paise: pricing.subtotalPaise,
        discount_paise: pricing.discountPaise,
        cgst_paise: pricing.cgstPaise,
        sgst_paise: pricing.sgstPaise,
        tip_paise: 0,
        total_paise: pricing.totalPaise,
        notes: sanitizedNotes,
      },
      { transaction }
    );

    const orderItemRows = pricing.resolvedItems.map((ri) => ({
      order_id: order.id,
      menu_item_id: ri.menuItemId,
      variant_id: ri.variantId,
      station_id: ri.stationId,
      item_name_snapshot: ri.itemNameSnapshot,
      variant_name_snapshot: ri.variantNameSnapshot,
      unit_price_paise: ri.unitPricePaise,
      quantity: ri.quantity,
      line_total_paise: ri.lineTotalPaise,
      status: 'queued',
      special_instructions: ri.specialInstructions,
    }));

    await OrderItem.bulkCreate(orderItemRows, { transaction });

    if (table.status === 'free') {
      await Table.update({ status: 'ordered' }, { where: { id: table.id }, transaction });
    }

    return Order.findByPk(order.id, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction,
    });
  });

  if (io) {
    const payload = {
      order: createdOrder,
      table: { id: table.id, table_number: table.table_number, label: table.label, status: 'ordered' },
    };
    io.to('role:waiter').to('role:manager').to('role:owner').emit('order:created', payload);
    io.to(`table_session:${tableSession.id}`).emit('order:updated', { order: createdOrder });
    io.to('role:waiter').to('role:manager').to('role:owner').emit('table:status_changed', payload.table);
  }

  return createdOrder;
}

export async function getSessionOrders(tableSessionId) {
  const { Order, OrderItem } = getModels();
  return Order.findAll({
    where: { table_session_id: tableSessionId },
    include: [{ model: OrderItem, as: 'items' }],
    order: [['created_at', 'DESC']],
  });
}
