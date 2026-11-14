import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { bulkDeleteDishesSchema, parseJsonBody } from '@/lib/validators';

export const POST = withStaffAuth(['manager', 'owner'], async (req, { actor: staff }) => {
  const body = await parseJsonBody(req, bulkDeleteDishesSchema);

    if (body.confirmationText !== 'DELETE') {
      throw new AppError(400, 'Confirmation text must be exact word "DELETE".', 'CONFIRMATION_REQUIRED');
    }

    const now = new Date();
    let affectedCount = 0;

    if (body.deleteAll) {
      const res = await prisma.menuItem.updateMany({
        where: { archivedAt: null },
        data: {
          archivedAt: now,
          isAvailable: false,
        },
      });
      affectedCount = res.count;
    } else if (body.itemIds && body.itemIds.length > 0) {
      const res = await prisma.menuItem.updateMany({
        where: { id: { in: body.itemIds }, archivedAt: null },
        data: {
          archivedAt: now,
          isAvailable: false,
        },
      });
      affectedCount = res.count;
    } else {
      throw new AppError(400, 'Specify itemIds or deleteAll: true.', 'INVALID_REQUEST');
    }

    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'DISHES_BULK_SOFT_DELETED',
      entityType: 'MenuItem',
      metadata: {
        affectedCount,
        deleteAll: !!body.deleteAll,
        itemIds: body.itemIds || [],
      },
    });

    return NextResponse.json({
      success: true,
      message: `${affectedCount} dish(es) soft-deleted successfully.`,
      count: affectedCount,
    });
});
