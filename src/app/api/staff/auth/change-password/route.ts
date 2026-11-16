import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { assertValidPassword } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/validators';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(72, 'New password cannot exceed 72 characters'),
  })
  .strict();

export const POST = withStaffAuth(
  ['owner', 'manager', 'waiter', 'chef'],
  async (req, { actor }) => {
    const body = await parseJsonBody(req, changePasswordSchema);

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');

    const validCurrent = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!validCurrent) {
      await recordAuditLog({
        actorUserId: user.id,
        actorRole: user.roleId ? actor.role : 'unknown',
        action: 'PASSWORD_CHANGE_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: getClientIp(req),
        metadata: { reason: 'invalid_current_password' },
      });
      throw new AppError(400, 'Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
    }

    const samePassword = await bcrypt.compare(body.newPassword, user.passwordHash);
    if (samePassword) {
      throw new AppError(400, 'New password cannot be the same as your current password.', 'PASSWORD_REUSE');
    }

    // Enforce password policy
    assertValidPassword(body.newPassword, {
      email: user.email,
      username: user.username,
      id: user.id,
      name: user.name,
    });

    const newHashed = await bcrypt.hash(body.newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHashed,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorRole: actor.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully.' });
  }
);
