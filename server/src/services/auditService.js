import { getModels } from '../db/models/index.js';
import { logger } from '../config/logger.js';

export async function recordAuditLog({
  actorUserId = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
  transaction = null,
}) {
  try {
    const { AuditLog } = getModels();
    await AuditLog.create(
      {
        actor_user_id: actorUserId,
        actor_role: actorRole,
        action,
        entity_type: entityType,
        entity_id: entityId != null ? String(entityId) : null,
        ip_address: ipAddress ? String(ipAddress).slice(0, 64) : null,
        user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
        metadata_json: metadata,
      },
      transaction ? { transaction } : undefined
    );
  } catch (err) {
    logger.error({ err, action, entityType }, 'Failed to persist audit log');
  }
}
