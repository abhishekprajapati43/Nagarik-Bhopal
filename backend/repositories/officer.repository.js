import { PENDING_STATUSES, ACTIVE_WORK_STATUSES, RESOLVED_STATUSES } from "../../shared/constants.js";
import { query } from "../config/database.js";

const OFFICER_SELECT = `
  SELECT o.*, u.name, u.email, u.status AS user_status,
         (SELECT count(*) FROM complaints c WHERE c.assigned_officer_id = o.id)::int AS complaint_count,
         (SELECT count(*) FROM complaints c
           WHERE c.assigned_officer_id = o.id AND c.status = ANY($1::text[]))::int AS resolved_count
  FROM officers o
  JOIN users u ON u.id = o.user_id
`;

export const findByUserId = async (userId, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM officers WHERE user_id = $1", [userId]);
  return rows[0] || null;
};

export const findById = async (id) => {
  const { rows } = await query(`${OFFICER_SELECT} WHERE o.id = $2`, [RESOLVED_STATUSES, id]);
  return rows[0] || null;
};

export const findByEmployeeCode = async (code) => {
  const { rows } = await query(`${OFFICER_SELECT} WHERE lower(o.employee_code) = lower($2)`, [
    RESOLVED_STATUSES,
    code,
  ]);
  return rows[0] || null;
};

export const listActive = async () => {
  const { rows } = await query(
    `${OFFICER_SELECT}
     WHERE o.is_active = true AND u.status = 'active'
     ORDER BY u.name ASC`,
    [RESOLVED_STATUSES]
  );
  return rows;
};

export const create = async (officer, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO officers (user_id, employee_code, designation, zone, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      officer.userId,
      officer.employeeCode || "",
      officer.designation || "Sanitation Officer",
      officer.zone || "Central",
      officer.phone || "",
    ]
  );
  return rows[0];
};

/** Counters shown on the officer dashboard. */
export const dashboardStats = async (officerId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = ANY($2::text[]))::int AS pending,
            count(*) FILTER (WHERE status = ANY($3::text[]))::int AS in_progress,
            count(*) FILTER (WHERE status = ANY($4::text[]))::int AS resolved
     FROM complaints
     WHERE assigned_officer_id = $1`,
    [officerId, PENDING_STATUSES, ACTIVE_WORK_STATUSES, RESOLVED_STATUSES]
  );

  const today = await query(
    `SELECT count(DISTINCT complaint_id)::int AS total
     FROM complaint_assignments
     WHERE officer_id = $1 AND assigned_at::date = CURRENT_DATE`,
    [officerId]
  );

  return { ...rows[0], assigned_today: today.rows[0].total };
};

export const countByStatus = async (officerId) => {
  const { rows } = await query(
    `SELECT status, count(*)::int AS count
     FROM complaints WHERE assigned_officer_id = $1 GROUP BY status`,
    [officerId]
  );
  return rows;
};

export default {
  findByUserId,
  findById,
  findByEmployeeCode,
  listActive,
  create,
  dashboardStats,
  countByStatus,
};
