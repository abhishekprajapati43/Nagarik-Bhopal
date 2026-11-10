import { query } from "../config/database.js";

const runner = (db) => (sql, params) => (db ? db.query(sql, params) : query(sql, params));

const PHONE_SQL = "right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)";

export const findById = async (id, db = null) => {
  const { rows } = await runner(db)("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
};

export const findByIdWithWard = async (id) => {
  const { rows } = await query(
    `SELECT u.*, w.name AS ward_name
     FROM users u LEFT JOIN wards w ON w.id = u.ward_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const findByEmail = async (email, db = null) => {
  const { rows } = await runner(db)(
    "SELECT * FROM users WHERE lower(email) = lower($1)",
    [email]
  );
  return rows[0] || null;
};

export const findByPhone = async (digits, db = null) => {
  const { rows } = await runner(db)(
    `SELECT * FROM users WHERE phone <> '' AND ${PHONE_SQL} = $1 LIMIT 1`,
    [digits]
  );
  return rows[0] || null;
};

export const phoneTaken = async (digits, exceptId = "") => {
  if (!digits) return false;
  const { rows } = await query(
    `SELECT 1 FROM users
     WHERE phone <> '' AND ${PHONE_SQL} = $1 AND id <> $2
     LIMIT 1`,
    [digits, exceptId || ""]
  );
  return rows.length > 0;
};

export const create = async (user, db = null) => {
  const { rows } = await runner(db)(
    `INSERT INTO users (id, name, email, phone, ward_id, role, status, password_hash, created_at, updated_at)
     VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), now())
     RETURNING *`,
    [
      user.id || null,
      user.name,
      user.email,
      user.phone || "",
      user.wardId || null,
      user.role,
      user.status,
      user.passwordHash,
      user.createdAt || null,
    ]
  );
  return rows[0];
};

export const updateProfile = async (id, { name, phone, wardId }) => {
  const { rows } = await query(
    `UPDATE users
     SET name = $2, phone = $3, ward_id = $4
     WHERE id = $1
     RETURNING *`,
    [id, name, phone || "", wardId || null]
  );
  return rows[0] || null;
};

export const updatePassword = async (id, passwordHash, { revokeSessions = false } = {}) => {
  const { rows } = await query(
    `UPDATE users
     SET password_hash = $2,
         token_version = token_version + $3
     WHERE id = $1
     RETURNING *`,
    [id, passwordHash, revokeSessions ? 1 : 0]
  );
  return rows[0] || null;
};

export const setStatus = async (id, status) => {
  const { rows } = await query(
    "UPDATE users SET status = $2 WHERE id = $1 RETURNING *",
    [id, status]
  );
  return rows[0] || null;
};

export const touchLogin = async (id) => {
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [id]);
};

export const list = async ({ search = "", status = "", page = 1, limit = 20 } = {}) => {
  const where = ["u.role = 'user'"];
  const params = [];

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    const index = params.length;
    where.push(`(
      lower(u.name) LIKE $${index}
      OR lower(u.email) LIKE $${index}
      OR lower(u.phone) LIKE $${index}
      OR lower(COALESCE(w.name, '')) LIKE $${index}
    )`);
  }

  if (status) {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countResult = await query(
    `SELECT count(*)::int AS total
     FROM users u LEFT JOIN wards w ON w.id = u.ward_id
     ${whereSql}`,
    params
  );

  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT u.*, w.name AS ward_name,
            (SELECT count(*) FROM complaints c WHERE c.user_id = u.id)::int AS complaint_count
     FROM users u LEFT JOIN wards w ON w.id = u.ward_id
     ${whereSql}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows, total: countResult.rows[0].total };
};

export const countResidents = async () => {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'blocked')::int AS blocked
     FROM users WHERE role = 'user'`
  );
  return rows[0];
};

export const listAdminIds = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active'"
  );
  return rows.map((row) => row.id);
};

export const listAudienceIds = async ({ wardId = "" } = {}) => {
  const params = [];
  let whereSql = "WHERE role = 'user' AND status = 'active'";

  if (wardId) {
    params.push(wardId);
    whereSql += ` AND ward_id = $${params.length}`;
  }

  const { rows } = await query(`SELECT id FROM users ${whereSql}`, params);
  return rows.map((row) => row.id);
};
