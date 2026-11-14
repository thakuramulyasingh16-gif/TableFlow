import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/sanitize';
import { createMenuItemSchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth(['owner', 'manager'], async (req, { actor }) => {
  const body = await parseJsonBody(req, createMenuItemSchema);

  const item = await prisma.menuItem.create({
    data: {
      categoryId: body.categoryId,
      stationId: body.stationId,
      name: sanitizeUserText(body.name, 120),
      description: body.description ? sanitizeUserText(body.description, 1000) : null,
      imageUrl: body.imageUrl ?? null,
      basePricePaise: body.basePricePaise,
      isVeg: body.isVeg,
      spiceLevel: body.spiceLevel ?? 'mild',
      allergens: body.allergens ?? [],
      isAvailable: body.isAvailable ?? true,
      prepTimeMins: body.prepTimeMins ?? 15,
      ...(body.variants?.length
        ? {
            variants: {
              create: body.variants.map((v) => ({
                name: sanitizeUserText(v.name, 60),
                priceDeltaPaise: v.priceDeltaPaise,
                isDefault: v.isDefault ?? false,
                isAvailable: true,
              })),
            },
          }
        : {}),
    },
    include: { variants: true },
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'MENU_ITEM_CREATED',
    entityType: 'menu_item',
    entityId: item.id,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
    metadata: { name: item.name, basePricePaise: item.basePricePaise },
  });

  return NextResponse.json({ item }, { status: 201 });
});

