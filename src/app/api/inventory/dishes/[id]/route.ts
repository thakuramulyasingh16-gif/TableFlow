import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const DELETE = withStaffAuth<{ id: string }>(['manager', 'owner'], async (req, { params, actor: staff }) => {
  const { id: rawId } = await params;
  const itemId = parseInt(rawId, 10);
  if (isNaN(itemId) || itemId <= 0) {
    throw new AppError(400, 'Invalid dish ID', 'INVALID_ID');
  }

  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new AppError(404, 'Dish not found', 'NOT_FOUND');
  }

  if (item.archivedAt) {
    return NextResponse.json({ success: true, message: 'Dish already deleted (archived)' });
  }

  // Soft delete: sets archivedAt and marks unavailable
  const updated = await prisma.menuItem.update({
    where: { id: item.id },
    data: {
      archivedAt: new Date(),
      isAvailable: false,
    },
  });

  await recordAuditLog({
    actorUserId: staff.id,
    actorRole: staff.role,
    action: 'DISH_SOFT_DELETED',
    entityType: 'MenuItem',
    entityId: item.id,
    metadata: { dishName: item.name },
  });

  return NextResponse.json({
    success: true,
    message: `Dish "${item.name}" soft deleted successfully.`,
    dish: updated,
  });
});
