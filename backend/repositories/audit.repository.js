import { query } from "../config/database.js";
import { logger } from "../utils/logger.js";

export const record = async ({
  actorId = null,
  action,
  entity = "",
  entityId = "",
  ip = "",
  userAgent = "",
  metadata = {},
}) => {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [actorId, action, entity, entityId, ip, userAgent.slice(0, 300), JSON.stringify(metadata)]
    );
  } catch (error) {
    // Auditing must never break the request it is recording.
    logger.warn("Could not write audit log", { action, error: error.message });
  }
};
