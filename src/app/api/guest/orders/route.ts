import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { getEnv } from '@/lib/env';
import { requireGuestSession } from '@/lib/guest-session';
import { evaluateDishAvailability } from '@/lib/inventory/availability';
import { calculateOrderPricing } from '@/lib/pricing';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';
import { sanitizeUserText } from '@/lib/sanitize';
import { getRestaurantSettings } from '@/lib/settings';
import { createGuestOrderSchema, parseJsonBody } from '@/lib/validators';

function generateOrderNumber(): string {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `TF-${ts}-${suffix}`;
}

export async function GET() {
  try {
    const { session } = await requireGuestSession({ allowPaid: true });
    const orders = await prisma.order.findMany({
      where: { tableSessionId: session.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ orders });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);
    const { session, table } = await requireGuestSession();
    await enforceRateLimit('order', `${getClientIp(req)}:${session.id}`);

    const body = await parseJsonBody(req, createGuestOrderSchema);
    const env = getEnv();

    const itemIds = [...new Set(body.items.map((i) => i.menuItemId))];
    const variantIds = [...new Set(body.items.map((i) => i.variantId).filter((v): v is number => v != null))];

    // Abuse control: Enforce max 30 items per order
    const totalItemsCount = body.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItemsCount > 30) {
      throw new AppError(400, 'Orders are limited to a maximum of 30 items per order.', 'MAX_ITEMS_EXCEEDED');
    }

    const [menuItems, variants, deal] = await Promise.all([
      prisma.menuItem.findMany({
        where: { id: { in: itemIds }, archivedAt: null },
        include: {
          recipeItems: { include: { ingredient: true } },
        },
      }),
      variantIds.length
        ? prisma.itemVariant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve([]),
      body.dealCode
        ? prisma.deal.findUnique({ where: { code: body.dealCode.trim().toUpperCase() } })
        : Promise.resolve(null),
    ]);

    if (body.dealCode && !deal) {
      throw new AppError(400, 'Promo code not found.', 'DEAL_NOT_FOUND');
    }

    // Verify all requested menu items exist and are not archived
    if (menuItems.length !== itemIds.length) {
      throw new AppError(400, 'One or more selected dishes are no longer offered.', 'ITEM_NOT_FOUND');
    }

    // Single source of truth availability check
    for (const item of menuItems) {
      const avail = evaluateDishAvailability(item);
      if (!avail.isAvailable) {
        throw new AppError(
          400,
          `"${item.name}" is currently unavailable because essential ingredients are out of stock.`,
          'ITEM_UNAVAILABLE'
        );
      }
    }

    const menuItemsMap = new Map(menuItems.map((m) => [m.id, m]));
    const variantsMap = new Map(variants.map((v) => [v.id, v]));

    const settings = await getRestaurantSettings();
    const pricing = calculateOrderPricing({
      requestedItems: body.items,
      menuItemsMap,
      variantsMap,
      deal,
      cgstBps: settings.cgstBps ?? env.CGST_BPS,
      sgstBps: settings.sgstBps ?? env.SGST_BPS,
      tipPaise: 0,
    });

    // Abuse control: Enforce max order value without prior staff verification
    const MAX_ORDER_VALUE_PAISE = 2000000; // ₹20,000 maximum per unverified guest order
    if (pricing.totalPaise > MAX_ORDER_VALUE_PAISE) {
      throw new AppError(
        400,
        'Order value exceeds ₹20,000 limit. Please speak to your waiter to place banquet orders.',
        'MAX_ORDER_VALUE_EXCEEDED'
      );
    }

    const sanitizedNotes = body.notes ? sanitizeUserText(body.notes, 500) : null;

    const order = await prisma.$transaction(async (tx) => {
      // Abuse control: Enforce max 5 open orders per session
      const openOrdersCount = await tx.order.count({
        where: {
          tableSessionId: session.id,
          status: { in: ['received', 'confirmed', 'preparing', 'ready'] },
        },
      });
      if (openOrdersCount >= 5) {
        throw new AppError(
          429,
          'Your table has 5 active orders in progress. Please wait for current orders to be served before placing more.',
          'MAX_OPEN_ORDERS_EXCEEDED'
        );
      }

      // Abuse control: Concurrency-safe pessimistic lock and atomic deal redemption validation
      if (deal) {
        // Concurrency-safe pessimistic lock on the deal row
        const lockedDeals = await tx.$queryRaw<Array<{ id: number; is_active: boolean }>>`
          SELECT id, is_active FROM deals WHERE id = ${deal.id} FOR UPDATE
        `;
        if (!lockedDeals.length || !lockedDeals[0]?.is_active) {
          throw new AppError(400, 'Selected deal is no longer active.', 'DEAL_INVALID');
        }

        // 1. One-time code check
        if (deal.isOneTime) {
          const existingCount = await tx.order.count({
            where: { dealId: deal.id, status: { not: 'cancelled' } },
          });
          if (existingCount >= 1) {
            throw new AppError(400, 'This promo code is single-use and has already been redeemed.', 'DEAL_ALREADY_REDEEMED');
          }
        }

        // 2. Global maxRedemptions
        if (deal.maxRedemptions != null) {
          const totalRedemptions = await tx.order.count({
            where: { dealId: deal.id, status: { not: 'cancelled' } },
          });
          if (totalRedemptions >= deal.maxRedemptions) {
            throw new AppError(400, 'This promo code has reached its maximum total redemptions.', 'DEAL_EXHAUSTED');
          }
        }

        // 3. Per-session limit
        if (deal.perSessionLimit != null) {
          const sessionRedemptions = await tx.order.count({
            where: { dealId: deal.id, tableSessionId: session.id, status: { not: 'cancelled' } },
          });
          if (sessionRedemptions >= deal.perSessionLimit) {
            throw new AppError(400, 'You have reached the redemption limit for this deal in this session.', 'DEAL_SESSION_LIMIT_EXCEEDED');
          }
        }

        // 4. Per-table limit
        if (deal.perTableLimit != null) {
          const tableRedemptions = await tx.order.count({
            where: { dealId: deal.id, tableId: table.id, status: { not: 'cancelled' } },
          });
          if (tableRedemptions >= deal.perTableLimit) {
            throw new AppError(400, 'This deal has reached the maximum allowed redemptions for this table.', 'DEAL_TABLE_LIMIT_EXCEEDED');
          }
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          tableId: table.id,
          tableSessionId: session.id,
          dealId: deal ? deal.id : null,
          status: 'received',
          subtotalPaise: pricing.subtotalPaise,
          discountPaise: pricing.discountPaise,
          cgstPaise: pricing.cgstPaise,
          sgstPaise: pricing.sgstPaise,
          tipPaise: 0,
          totalPaise: pricing.totalPaise,
          notes: sanitizedNotes,
          items: {
            create: pricing.resolvedItems.map((ri) => ({
              menuItemId: ri.menuItemId,
              variantId: ri.variantId,
              stationId: ri.stationId,
              itemNameSnapshot: ri.itemNameSnapshot,
              variantNameSnapshot: ri.variantNameSnapshot,
              unitPricePaise: ri.unitPricePaise,
              quantity: ri.quantity,
              lineTotalPaise: ri.lineTotalPaise,
              status: 'queued',
              specialInstructions: ri.specialInstructions,
            })),
          },
        },
        include: { items: true },
      });

      if (table.status === 'free') {
        await tx.table.update({ where: { id: table.id }, data: { status: 'ordered' } });
      }
      return created;
    });

    await Promise.all([
      broadcastRealtime('staff:updates', 'order:created', { orderId: order.id, tableId: table.id }),
      broadcastRealtime(`table_session:${session.id}`, 'order:updated', { orderId: order.id }),
    ]);

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

