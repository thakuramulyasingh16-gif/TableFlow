import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireCsrf } from '@/lib/csrf';
import { getEnv } from '@/lib/env';
import { requireGuestSession } from '@/lib/guest-session';
import { calculateOrderPricing } from '@/lib/pricing';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { broadcastRealtime } from '@/lib/realtime';
import { sanitizeUserText } from '@/lib/sanitize';
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

    const [menuItems, variants, deal] = await Promise.all([
      prisma.menuItem.findMany({ where: { id: { in: itemIds } } }),
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

    const menuItemsMap = new Map(menuItems.map((m) => [m.id, m]));
    const variantsMap = new Map(variants.map((v) => [v.id, v]));

    const pricing = calculateOrderPricing({
      requestedItems: body.items,
      menuItemsMap,
      variantsMap,
      deal,
      cgstBps: env.CGST_BPS,
      sgstBps: env.SGST_BPS,
      tipPaise: 0,
    });

    const sanitizedNotes = body.notes ? sanitizeUserText(body.notes, 500) : null;

    const order = await prisma.$transaction(async (tx) => {
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

