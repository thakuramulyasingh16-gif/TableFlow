import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
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

  if (!table || !table.isActive) {
    throw new AppError(404, 'Table not found or inactive.', 'TABLE_NOT_FOUND');
  }

  // Check if table already has an active session
  let activeSession = await prisma.tableSession.findFirst({
    where: { tableId: id, status: 'active', expiresAt: { gt: new Date() } },
  });

  if (!activeSession) {
    // Generate 4-digit numeric PIN
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    activeSession = await prisma.tableSession.create({
      data: {
        tableId: id,
        sessionTokenHash,
        rawToken: rawSessionToken,
        joinPin: pin,
        status: 'active',
        expiresAt,
      },
    });

    await prisma.table.update({
      where: { id },
      data: { status: 'ordered' },
    });
  }

  await broadcastRealtime('staff:updates', 'table:status_changed', {
    id: table.id,
    tableNumber: table.tableNumber,
    status: 'ordered',
    pin: activeSession.joinPin,
  });

  return NextResponse.json({
    table: { ...table, status: 'ordered' },
    session: {
      id: activeSession.id,
      joinPin: activeSession.joinPin,
      createdAt: activeSession.createdAt,
    },
  });
});
