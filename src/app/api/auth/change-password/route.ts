import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireCsrf } from '@/lib/csrf';
import { assertValidPassword, DUMMY_HASH } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseJsonBody, publicChangePasswordSchema } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);

    const body = await parseJsonBody(req, publicChangePasswordSchema);
    const ip = getClientIp(req);

    await enforceRateLimit('change_password_ip', ip);
    const normalizedId = body.id.trim().toLowerCase();
    await enforceRateLimit('change_password_id', `${ip}:${normalizedId}`);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedId },
          { username: { equals: normalizedId, mode: 'insensitive' } },
        ],
      },
      include: { role: true },
    });

    if (!user) {
      await bcrypt.compare(body.currentPassword, DUMMY_HASH);
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }

    const validCurrent = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!validCurrent) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil,
        },
      });

      await recordAuditLog({
        actorUserId: user.id,
        actorRole: user.role?.name || 'unknown',
        action: 'PASSWORD_CHANGE_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: ip,
        metadata: { reason: 'invalid_current_password', via: 'public_change_password' },
      });

      throw new AppError(400, 'Invalid ID or password.', 'INVALID_CREDENTIALS');
    }

    const samePassword = await bcrypt.compare(body.newPassword, user.passwordHash);
    if (samePassword) {
      throw new AppError(400, 'New password cannot be the same as your current password.', 'PASSWORD_REUSE');
    }

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
      actorRole: user.role?.name || 'unknown',
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
      metadata: { via: 'public_change_password' },
    });

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
