import { query } from "../config/database.js";

export const enqueue = async (mail, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO email_outbox
       (to_email, subject, body, template_key, status, transport, complaint_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      mail.to,
      mail.subject,
      mail.body,
      mail.templateKey || "",
      mail.status || "queued",
      mail.transport || "",
      mail.complaintId || null,
    ]
  );
  return rows[0];
};

export const markSent = async (id, transport) => {
  const { rows } = await query(
    `UPDATE email_outbox
     SET status = 'sent', transport = $2, sent_at = now(), error = ''
     WHERE id = $1
     RETURNING *`,
    [id, transport || ""]
  );
  return rows[0] || null;
};

export const markFailed = async (id, error, transport = "") => {
  const { rows } = await query(
    `UPDATE email_outbox
     SET status = 'failed', transport = $2, error = $3
     WHERE id = $1
     RETURNING *`,
    [id, transport || "", String(error || "").slice(0, 500)]
  );
  return rows[0] || null;
};

export const list = async (limit = 100) => {
  const { rows } = await query(
    `SELECT e.*, u.name AS citizen_name
     FROM email_outbox e
     LEFT JOIN complaints c ON c.id = e.complaint_id
     LEFT JOIN users u ON u.id = c.user_id
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return rows;
};
