import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/sanitize';
import { parseJsonBody, updateMenuItemSchema } from '@/lib/validators';

export const PATCH = withStaffAuth<{ id: string }>(['owner', 'manager'], async (req, { params, actor }) => {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new AppError(400, 'Invalid menu item ID.', 'VALIDATION_ERROR');
  }

  const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
  if (!existing) throw new AppError(404, 'Menu item not found.', 'NOT_FOUND');

  const body = await parseJsonBody(req, updateMenuItemSchema);

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.stationId !== undefined ? { stationId: body.stationId } : {}),
      ...(body.name !== undefined ? { name: sanitizeUserText(body.name, 120) } : {}),
      ...(body.description !== undefined ? { description: sanitizeUserText(body.description, 1000) } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      ...(body.basePricePaise !== undefined ? { basePricePaise: body.basePricePaise } : {}),
      ...(body.isVeg !== undefined ? { isVeg: body.isVeg } : {}),
      ...(body.spiceLevel !== undefined ? { spiceLevel: body.spiceLevel } : {}),
      ...(body.allergens !== undefined ? { allergens: body.allergens } : {}),
      ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
      ...(body.prepTimeMins !== undefined ? { prepTimeMins: body.prepTimeMins } : {}),
    },
    include: { variants: true },
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action:
      body.basePricePaise !== undefined && body.basePricePaise !== existing.basePricePaise
        ? 'PRICE_CHANGED'
        : 'MENU_ITEM_UPDATED',
    entityType: 'menu_item',
    entityId: updated.id,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
    metadata: {
      prevPrice: existing.basePricePaise,
      newPrice: updated.basePricePaise,
      isAvailable: updated.isAvailable,
    },
  });

  return NextResponse.json({ item: updated });
});

export const DELETE = withStaffAuth<{ id: string }>(['owner', 'manager'], async (_req, { params }) => {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new AppError(400, 'Invalid menu item ID.', 'VALIDATION_ERROR');
  }

  const usedCount = await prisma.orderItem.count({ where: { menuItemId: itemId } });
  if (usedCount > 0) {
    await prisma.menuItem.update({ where: { id: itemId }, data: { isAvailable: false } });
    return NextResponse.json({ deactivated: true });
  }

  await prisma.menuItem.delete({ where: { id: itemId } });
  return NextResponse.json({ deleted: true });
});

