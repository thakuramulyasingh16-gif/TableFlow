import { NextResponse } from 'next/server';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { parseJsonBody, updateStaffSchema } from '@/lib/validators';

export const PATCH = withStaffAuth<{ id: string }>(['owner'], async (req, { params, actor }) => {
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new AppError(400, 'Invalid user ID.', 'VALIDATION_ERROR');
  }

  const body = await parseJsonBody(req, updateStaffSchema);
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { role: true },
  });
  if (!target) throw new AppError(404, 'Staff user not found.', 'USER_NOT_FOUND');

  const isTargetActiveOwner = target.role.name === 'owner' && target.isActive;
  const isDemotingOrDeactivating =
    (body.isActive === false && target.isActive) ||
    (body.role !== undefined && body.role !== 'owner' && target.role.name === 'owner');

  if (isTargetActiveOwner && isDemotingOrDeactivating) {
    const activeOwnerCount = await prisma.user.count({
      where: {
        role: { name: 'owner' },
        isActive: true,
        id: { not: target.id },
      },
    });
    if (activeOwnerCount === 0) {
      throw new AppError(
        400,
        'Cannot demote or deactivate the last remaining active owner.',
        'LAST_OWNER_PROTECTION'
      );
    }
  }

  if (target.id === actor.id && body.isActive === false) {
    throw new AppError(400, 'You cannot deactivate your own owner account.', 'SELF_DEACTIVATE_BLOCKED');
  }

  let roleChanged = false;
  let roleId = target.roleId;
  let bumpVersion = false;

  if (body.role !== undefined && body.role !== target.role.name) {
    const nextRole = await prisma.role.findUnique({ where: { name: body.role } });
    if (!nextRole) throw new AppError(400, 'Invalid role.', 'INVALID_ROLE');
    roleId = nextRole.id;
    roleChanged = true;
    bumpVersion = true;
  }

  if (body.isActive === false) {
    bumpVersion = true;
  }

  let normalizedUsername: string | null | undefined = undefined;
  if (body.username !== undefined) {
    if (body.username) {
      const norm = body.username.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: {
          username: { equals: norm, mode: 'insensitive' },
          id: { not: target.id },
        },
      });
      if (existing) {
        throw new AppError(409, 'Username is already taken.', 'USERNAME_TAKEN');
      }
      normalizedUsername = norm;
    } else {
      normalizedUsername = null;
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      roleId,
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(normalizedUsername !== undefined ? { username: normalizedUsername } : {}),
      ...(bumpVersion ? { tokenVersion: target.tokenVersion + 1 } : {}),
    },
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: roleChanged ? 'STAFF_ROLE_CHANGED' : 'STAFF_UPDATED',
    entityType: 'user',
    entityId: target.id,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
    metadata: body,
  });

  return NextResponse.json({ updated: true });
});
