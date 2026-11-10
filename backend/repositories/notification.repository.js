import { query } from "../config/database.js";

export const listForUser = async (userId, { page = 1, limit = 50 } = {}) => {
  const offset = (page - 1) * limit;

  const countResult = await query(
    "SELECT count(*)::int AS total FROM notifications WHERE user_id = $1",
    [userId]
  );

  const { rows } = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { rows, total: countResult.rows[0].total };
};

export const unreadCount = async (userId) => {
  const { rows } = await query(
    "SELECT count(*)::int AS total FROM notifications WHERE user_id = $1 AND is_read = false",
    [userId]
  );
  return rows[0].total;
};

export const create = async (notification, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO notifications (user_id, title, body, type, complaint_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      notification.userId,
      notification.title,
      notification.body,
      notification.type || "system",
      notification.complaintId || null,
    ]
  );
  return rows[0];
};

export const createForUsers = async (userIds, notification, db = null) => {
  if (!userIds.length) return 0;

  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const result = await exec(
    `INSERT INTO notifications (user_id, title, body, type, complaint_id)
     SELECT unnest($1::text[]), $2, $3, $4, $5`,
    [
      userIds,
      notification.title,
      notification.body,
      notification.type || "broadcast",
      notification.complaintId || null,
    ]
  );
  return result.rowCount;
};

export const markRead = async (userId, id = "") => {
  if (id) {
    const result = await query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    return result.rowCount;
  }

  const result = await query(
    "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
    [userId]
  );
  return result.rowCount;
};
