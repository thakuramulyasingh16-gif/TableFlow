import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { recalculateMenuItemAvailability } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { overrideDishAvailabilitySchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth(['manager', 'owner'], async (req, { actor: staff }) => {
  const body = await parseJsonBody(req, overrideDishAvailabilitySchema);

  const item = await prisma.menuItem.findUnique({
    where: { id: body.menuItemId, archivedAt: null },
  });

  if (!item) {
    throw new AppError(404, 'Menu item not found', 'NOT_FOUND');
  }

  const reason = sanitizeUserText(body.overrideReason, 255);

  await prisma.menuItem.update({
    where: { id: item.id },
    data: {
      isAvailableOverride: body.isAvailableOverride,
      overrideReason: body.isAvailableOverride === null ? null : reason,
    },
  });

  const result = await recalculateMenuItemAvailability(item.id);

  await recordAuditLog({
    actorUserId: staff.id,
    actorRole: staff.role,
    action: 'DISH_AVAILABILITY_OVERRIDDEN',
    entityType: 'MenuItem',
    entityId: item.id,
    metadata: {
      dishName: item.name,
      override: body.isAvailableOverride,
      reason,
      newAvailability: result.isAvailable,
    },
  });

  return NextResponse.json({
    success: true,
    dishId: item.id,
    isAvailable: result.isAvailable,
    isOverridden: result.isOverridden,
    overrideReason: result.overrideReason,
  });
});
