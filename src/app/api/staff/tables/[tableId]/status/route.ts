import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';
import { parseJsonBody, tableStatusUpdateSchema } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ tableId: string }> }
) {
  try {
    await requireStaffAuth(['waiter', 'manager', 'owner']);
    const { tableId } = await context.params;
    const id = Number(tableId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Invalid table ID.', 'VALIDATION_ERROR');
    }

    const body = await parseJsonBody(req, tableStatusUpdateSchema);
    const table = await prisma.table.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, tableNumber: true, label: true, status: true },
    });

    await broadcastRealtime('staff:updates', 'table:status_changed', table);
    return NextResponse.json({ table });
  } catch (err) {
    return handleApiError(err);
  }
}
