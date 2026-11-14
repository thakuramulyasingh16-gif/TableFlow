import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/validators';

const resetStaffPasswordSchema = z
  .object({
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
  })
  .strict();

export const POST = withStaffAuth<{ id: string }>(['owner'], async (req, { params, actor }) => {
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new AppError(400, 'Invalid user ID.', 'VALIDATION_ERROR');
  }

  const body = await parseJsonBody(req, resetStaffPasswordSchema);

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { role: true },
  });
  if (!target) throw new AppError(404, 'Staff user not found.', 'USER_NOT_FOUND');

  const hashed = await bcrypt.hash(body.newPassword, 12);

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: hashed,
      mustChangePassword: true, // Forces password change on first login
      tokenVersion: { increment: 1 },
    },
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'STAFF_PASSWORD_RESET',
    entityType: 'user',
    entityId: target.id,
    ipAddress: getClientIp(req),
    metadata: { targetEmail: target.email },
  });

  return NextResponse.json({
    success: true,
    message: 'Staff password has been reset. The user will be required to change it on next login.',
  });
});
