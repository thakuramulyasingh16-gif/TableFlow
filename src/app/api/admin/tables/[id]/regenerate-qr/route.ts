import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { generateOpaqueToken } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { generateTableQrAssets } from '@/lib/qr';
import { getClientIp } from '@/lib/rate-limit';

export const POST = withStaffAuth<{ id: string }>(['owner', 'manager'], async (req, { params, actor }) => {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    throw new AppError(400, 'Invalid table ID.', 'VALIDATION_ERROR');
  }

  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table) throw new AppError(404, 'Table not found.', 'NOT_FOUND');

  const nextToken = generateOpaqueToken(32);

  await prisma.$transaction(async (tx) => {
    await tx.table.update({
      where: { id: tableId },
      data: { qrToken: nextToken },
    });
    await tx.tableSession.updateMany({
      where: { tableId, status: 'active' },
      data: { status: 'expired', closedAt: new Date() },
    });
    await recordAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'TABLE_QR_REGENERATED',
      entityType: 'table',
      entityId: tableId,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      metadata: { tableNumber: table.tableNumber },
      tx,
    });
  });

  const qr = await generateTableQrAssets(nextToken);
  return NextResponse.json({ tableId, qrToken: nextToken, ...qr });
});

