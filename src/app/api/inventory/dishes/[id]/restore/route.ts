import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth } from '@/lib/auth-guard';
import { recalculateMenuItemAvailability } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaffAuth(['manager', 'owner']);
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

    if (!item.archivedAt) {
      return NextResponse.json({ success: true, message: 'Dish is not archived.', dish: item });
    }

    // Restore dish
    const restored = await prisma.menuItem.update({
      where: { id: item.id },
      data: { archivedAt: null },
    });

    // Recompute availability based on recipes
    await recalculateMenuItemAvailability(item.id);

    await recordAuditLog({
      actorUserId: staff.id,
      actorRole: staff.role,
      action: 'DISH_RESTORED',
      entityType: 'MenuItem',
      entityId: item.id,
      metadata: { dishName: item.name },
    });

    return NextResponse.json({
      success: true,
      message: `Dish "${item.name}" restored successfully.`,
      dish: restored,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
