import { query } from "../config/database.js";

export const create = async ({ userId, tokenHash, expiresAt }, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
};

export const findValid = async (tokenHash) => {
  const { rows } = await query(
    `SELECT prt.*, u.id AS account_id, u.email, u.name, u.role, u.status
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
};

export const markUsed = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [id]);
};

export const deleteForUser = async (userId, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
};

export const pruneExpired = async () => {
  await query("DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'");
};
