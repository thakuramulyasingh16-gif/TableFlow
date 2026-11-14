import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const GET = withStaffAuth(['owner'], async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25));
  const skip = (page - 1) * limit;

  const actorQuery = searchParams.get('actor')?.trim();
  const role = searchParams.get('role')?.trim();
  const action = searchParams.get('action')?.trim();
  const entityType = searchParams.get('entityType')?.trim();
  const from = searchParams.get('from')?.trim();
  const to = searchParams.get('to')?.trim();

  const where: Prisma.AuditLogWhereInput = {};

  if (role) {
    where.actorRole = { equals: role };
  }

  if (action) {
    where.action = { contains: action, mode: 'insensitive' };
  }

  if (entityType) {
    where.entityType = { contains: entityType, mode: 'insensitive' };
  }

  if (actorQuery) {
    where.actor = {
      OR: [
        { name: { contains: actorQuery, mode: 'insensitive' } },
        { email: { contains: actorQuery, mode: 'insensitive' } },
      ],
    };
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        where.createdAt.gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        where.createdAt.lte = toDate;
      }
    }
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const serializedLogs = logs.map((log) => ({
    id: String(log.id),
    actorUserId: log.actorUserId,
    actorRole: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    metadataJson: log.metadataJson,
    createdAt: log.createdAt.toISOString(),
    actor: log.actor,
  }));

  return NextResponse.json({
    logs: serializedLogs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});
