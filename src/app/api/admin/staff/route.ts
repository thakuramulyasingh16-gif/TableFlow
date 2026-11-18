import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth, withStaffAuth } from '@/lib/auth-guard';
import { assertValidPassword } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { sanitizeUserText } from '@/lib/sanitize';
import { createStaffSchema, parseJsonBody } from '@/lib/validators';

const BCRYPT_COST = 12;

export async function GET() {
  try {
    await requireStaffAuth(['owner']);
    const staff = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        isActive: true,
        lockedUntil: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ staff });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withStaffAuth(['owner'], async (req, { actor }) => {
  const body = await parseJsonBody(req, createStaffSchema);

  const role = await prisma.role.findUnique({ where: { name: body.role } });
  if (!role) throw new AppError(400, 'Invalid role specified.', 'INVALID_ROLE');

  // Enforce password policy
  assertValidPassword(body.password, {
    email: body.email,
    username: body.username,
    name: body.name,
  });

  const existingEmail = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (existingEmail) {
    throw new AppError(409, 'Email is already in use.', 'EMAIL_TAKEN');
  }

  let normalizedUsername: string | null = null;
  if (body.username) {
    normalizedUsername = body.username.trim().toLowerCase();
    const existingUsername = await prisma.user.findFirst({
      where: {
        username: { equals: normalizedUsername, mode: 'insensitive' },
      },
    });
    if (existingUsername) {
      throw new AppError(409, 'Username is already taken.', 'USERNAME_TAKEN');
    }
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
  const created = await prisma.user.create({
    data: {
      name: sanitizeUserText(body.name, 120),
      email: body.email.toLowerCase(),
      username: normalizedUsername,
      passwordHash,
      roleId: role.id,
      isActive: true,
    },
  });

  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'STAFF_CREATED',
    entityType: 'user',
    entityId: created.id,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
    metadata: { role: role.name, email: created.email, username: created.username },
  });

  return NextResponse.json(
    {
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        username: created.username,
        role: role.name,
        isActive: created.isActive,
      },
    },
    { status: 201 }
  );
});
