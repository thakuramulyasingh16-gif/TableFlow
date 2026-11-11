import { NextRequest, NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { parseJsonBody, updateStaffSchema } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireStaffAuth(['owner']);
    const { id } = await context.params;
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

    await prisma.user.update({
      where: { id: target.id },
      data: {
        roleId,
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
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
  } catch (err) {
    return handleApiError(err);
  }
}
