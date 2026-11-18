import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { assertValidPassword } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/validators';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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
    const ip = getClientIp(req);
    await enforceRateLimit('change_password_ip', ip);
    await enforceRateLimit('change_password_id', `${ip}:${actor.id}`);

    const body = await parseJsonBody(req, changePasswordSchema);

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordAuditLog({
        actorUserId: user.id,
        actorRole: actor.role,
        action: 'PASSWORD_CHANGE_BLOCKED_LOCKED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: ip,
        metadata: { reason: 'account_locked', lockedUntil: user.lockedUntil },
      });
      throw new AppError(
        400,
        'Account is temporarily locked due to too many failed attempts. Please try again later.',
        'ACCOUNT_LOCKED'
      );
    }

    const validCurrent = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!validCurrent) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : null;

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil },
      });

      await recordAuditLog({
        actorUserId: user.id,
        actorRole: actor.role,
        action: lockedUntil ? 'ACCOUNT_LOCKED' : 'PASSWORD_CHANGE_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: ip,
        metadata: { attempts, reason: 'invalid_current_password' },
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
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorRole: actor.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully.' });
  },
  { allowChangePassword: true }
);
