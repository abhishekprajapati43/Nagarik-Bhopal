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
  if (!email) return null;
  const { rows } = await runner(db)(
    "SELECT * FROM users WHERE email <> '' AND lower(email) = lower($1)",
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

/** Duplicate Aadhaar check uses the keyed lookup hash, never the number. */
export const aadhaarHashTaken = async (hash, exceptId = "") => {
  if (!hash) return false;
  const { rows } = await query(
    `SELECT 1 FROM users
     WHERE aadhaar_hash IS NOT NULL AND aadhaar_hash <> '' AND aadhaar_hash = $1
       AND id <> $2
     LIMIT 1`,
    [hash, exceptId || ""]
  );
  return rows.length > 0;
};

export const create = async (user, db = null) => {
  const { rows } = await runner(db)(
    `INSERT INTO users (
       id, name, email, phone, ward_id, role, status, password_hash,
       aadhaar_number, aadhaar_last4, aadhaar_hash, aadhaar_verified,
       aadhaar_verified_at, verification_status, verification_remarks,
       aadhaar_submitted_at, created_at, updated_at
     )
     VALUES (
       COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, now()), now()
     )
     RETURNING *`,
    [
      user.id || null,
      user.name,
      user.email || "",
      user.phone || "",
      user.wardId || null,
      user.role,
      user.status,
      user.passwordHash,
      user.aadhaarNumber || null,
      user.aadhaarLast4 || "",
      user.aadhaarHash || null,
      Boolean(user.aadhaarVerified),
      user.aadhaarVerifiedAt || null,
      user.verificationStatus || "Pending",
      user.verificationRemarks || "",
      user.aadhaarSubmittedAt || null,
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

/**
 * Replace a resident's Aadhaar submission. Resubmitting after a rejection
 * returns the account to Pending and clears the previous decision.
 */
export const updateAadhaar = async (
  id,
  { encrypted, last4, hash, submittedAt = new Date().toISOString() } = {}
) => {
  const { rows } = await query(
    `UPDATE users
     SET aadhaar_number = $2,
         aadhaar_last4 = $3,
         aadhaar_hash = $4,
         aadhaar_verified = false,
         aadhaar_verified_at = null,
         verification_status = 'Pending',
         verification_remarks = '',
         aadhaar_submitted_at = $5,
         updated_at = now()
     WHERE id = $1 AND role = 'user'
     RETURNING *`,
    [id, encrypted, last4 || "", hash, submittedAt]
  );
  return rows[0] || null;
};

/** Record an administrator's approval or rejection. */
export const reviewAadhaar = async (
  id,
  { status, verified, remarks = "", verifiedAt = null } = {}
) => {
  const { rows } = await query(
    `UPDATE users
     SET verification_status = $2,
         aadhaar_verified = $3,
         aadhaar_verified_at = $4,
         verification_remarks = $5,
         updated_at = now()
     WHERE id = $1 AND role = 'user'
     RETURNING *`,
    [id, status, Boolean(verified), verifiedAt, remarks || ""]
  );
  return rows[0] || null;
};

export const listVerifications = async ({
  status = "",
  search = "",
  page = 1,
  limit = 20,
} = {}) => {
  const where = ["u.role = 'user'"];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`u.verification_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    const index = params.length;
    where.push(`(
      lower(u.name) LIKE $${index}
      OR lower(u.email) LIKE $${index}
      OR lower(u.phone) LIKE $${index}
      OR lower(COALESCE(w.name, '')) LIKE $${index}
      OR u.aadhaar_last4 LIKE $${index}
    )`);
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
    `SELECT u.*, w.name AS ward_name
     FROM users u LEFT JOIN wards w ON w.id = u.ward_id
     ${whereSql}
     ORDER BY
       CASE u.verification_status
         WHEN 'Pending' THEN 0
         WHEN 'Rejected' THEN 1
         ELSE 2
       END,
       u.aadhaar_submitted_at DESC NULLS LAST,
       u.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows, total: countResult.rows[0].total };
};

export const listAadhaarAudit = async (userId, limit = 50) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.metadata, a.created_at,
            COALESCE(actor.name, 'System') AS actor_name
     FROM audit_logs a
     LEFT JOIN users actor ON actor.id = a.actor_id
     WHERE a.entity = 'user' AND a.entity_id = $1 AND a.action LIKE 'aadhaar.%'
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
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
