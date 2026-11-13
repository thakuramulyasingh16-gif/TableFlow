import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function recordAuditLog({
  actorUserId = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
  tx = null,
}: {
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient | null;
}): Promise<void> {
  try {
    const client = tx || prisma;
    await client.auditLog.create({
      data: {
        actorUserId,
        actorRole,
        action,
        entityType,
        entityId: entityId != null ? String(entityId) : null,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 64) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
        metadataJson: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error('[AuditLog Error]', err instanceof Error ? err.message : err);
  }
}

