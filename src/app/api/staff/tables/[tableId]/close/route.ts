import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { broadcastRealtime } from '@/lib/realtime';

export const POST = withStaffAuth<{ tableId: string }>(['waiter', 'manager', 'owner'], async (req, { params }) => {
  const { tableId } = await params;
  const id = Number(tableId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'Invalid table ID.', 'VALIDATION_ERROR');
  }

  const table = await prisma.table.findUnique({
    where: { id },
  });

  if (!table) {
    throw new AppError(404, 'Table not found.', 'TABLE_NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Close any active sessions
    await tx.tableSession.updateMany({
      where: { tableId: id, status: 'active' },
      data: { status: 'closed', closedAt: new Date() },
    });

    // 2. Resolve any pending waiter calls
    await tx.waiterCall.updateMany({
      where: { tableId: id, status: 'pending' },
      data: { status: 'resolved', resolvedAt: new Date() },
    });

    // 3. Mark table free
    await tx.table.update({
      where: { id },
      data: { status: 'free' },
    });
  });

  await broadcastRealtime('staff:updates', 'table:status_changed', {
    id: table.id,
    tableNumber: table.tableNumber,
    status: 'free',
  });

  return NextResponse.json({
    table: { ...table, status: 'free' },
    message: 'Table closed and reset to free successfully.',
  });
});
