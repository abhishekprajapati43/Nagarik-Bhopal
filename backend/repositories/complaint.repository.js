import { COMPLAINT_CATEGORIES } from "../../shared/constants.js";
import { query } from "../config/database.js";

const VIEW_SELECT = `
  SELECT c.*, u.name AS user_name, u.email AS user_email,
         w.name AS ward_name, w.zone AS ward_zone, w.area AS ward_area,
         w.ward_number AS ward_number, w.zone_number AS ward_zone_number,
         w.assembly_constituency AS ward_assembly_constituency,
         w.councillor_name AS ward_councillor_name,
         w.councillor_mobile AS ward_councillor_mobile,
         w.population AS ward_population,
         r.name AS representative_name, r.phone AS representative_phone,
         r.email AS representative_email, r.mla_name AS representative_mla,
         r.office_address AS representative_office,
         o.employee_code AS officer_code, o.zone AS officer_zone,
         o.phone AS officer_phone,
         ou.name AS officer_name, ou.email AS officer_email,
         (SELECT count(*) FROM complaint_upvotes uv WHERE uv.complaint_id = c.id)::int AS upvotes,
         EXISTS (
           SELECT 1 FROM complaint_upvotes uv
           WHERE uv.complaint_id = c.id AND uv.user_id = $1
         ) AS upvoted,
         (SELECT count(*) FROM complaint_comments cc WHERE cc.complaint_id = c.id)::int AS comment_count
  FROM complaints c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN wards w ON w.id = c.ward_id
  LEFT JOIN representatives r ON r.id = c.representative_id
  LEFT JOIN officers o ON o.id = c.assigned_officer_id
  LEFT JOIN users ou ON ou.id = o.user_id
`;

/**
 * Append filter placeholders to `params` and return the WHERE clause. Only
 * conditions that are actually present consume a parameter, so the same
 * filters can be reused by the row query and the two count queries.
 */
const applyFilters = (filters = {}, params = []) => {
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.userId) where.push(`c.user_id = ${add(filters.userId)}`);
  if (filters.status) where.push(`c.status = ${add(filters.status)}`);
  if (filters.complaintCategory) {
    where.push(
      `COALESCE(c.complaint_category, 'garbage-collection') = ${add(filters.complaintCategory)}`
    );
  }
  if (filters.complaintType) {
    where.push(
      `COALESCE(c.complaint_type, c.waste_type) = ${add(filters.complaintType)}`
    );
  }
  if (filters.wasteType) where.push(`c.waste_type = ${add(filters.wasteType)}`);
  if (filters.wardId) where.push(`c.ward_id = ${add(filters.wardId)}`);
  if (filters.zoneNumber) {
    where.push(`w.zone_number = ${add(Number(filters.zoneNumber))}`);
  }
  if (filters.assemblyConstituency) {
    where.push(
      `lower(w.assembly_constituency) = ${add(String(filters.assemblyConstituency).toLowerCase())}`
    );
  }
  if (filters.priority) where.push(`c.priority = ${add(filters.priority)}`);
  if (filters.representativeId) {
    where.push(`c.representative_id = ${add(filters.representativeId)}`);
  }
  if (filters.assignedOfficerId) {
    where.push(`c.assigned_officer_id = ${add(filters.assignedOfficerId)}`);
  }
  if (filters.verificationStatus) {
    where.push(`c.verification_status = ${add(filters.verificationStatus)}`);
  }
  if (filters.unassignedOfficer) {
    where.push("c.assigned_officer_id IS NULL");
  }
  if (filters.from) where.push(`c.created_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`c.created_at <= ${add(filters.to)}`);

  if (filters.search) {
    const term = String(filters.search).toLowerCase();
    const like = add(`%${term}%`);

    // Let staff search by the human-readable category ("Water Supply") even
    // though the column stores the stable id ("water-supply").
    const categoryIds = COMPLAINT_CATEGORIES.filter(
      (category) =>
        category.id.includes(term) ||
        category.label.toLowerCase().includes(term) ||
        term.includes(category.label.toLowerCase())
    ).map((category) => category.id);

    const categoryClause = categoryIds.length
      ? ` OR COALESCE(c.complaint_category, 'garbage-collection') = ANY(${add(categoryIds)})`
      : "";

    where.push(`(
      lower(c.id) LIKE ${like}
      OR lower(c.address) LIKE ${like}
      OR lower(c.description) LIKE ${like}
      OR lower(COALESCE(c.complaint_category, '')) LIKE ${like}
      OR lower(COALESCE(c.complaint_type, c.waste_type, '')) LIKE ${like}
      OR lower(c.waste_type) LIKE ${like}
      OR lower(u.name) LIKE ${like}
      OR lower(COALESCE(w.name, '')) LIKE ${like}
      OR lower(COALESCE(w.area, '')) LIKE ${like}
      OR lower(COALESCE(w.zone, '')) LIKE ${like}
      OR lower(COALESCE(w.assembly_constituency, '')) LIKE ${like}
      OR lower(COALESCE(w.councillor_name, '')) LIKE ${like}
      OR COALESCE(w.ward_number, 0)::text LIKE ${like}
      OR regexp_replace(COALESCE(w.councillor_mobile, ''), '[^0-9]', '', 'g') LIKE ${like}
      OR lower(COALESCE(r.name, '')) LIKE ${like}
      OR lower(COALESCE(r.mla_name, '')) LIKE ${like}
      OR lower(COALESCE(o.employee_code, '')) LIKE ${like}
      OR lower(COALESCE(ou.name, '')) LIKE ${like}${categoryClause}
    )`);
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
};

const orderSql = (sort) => {
  if (sort === "oldest") return "c.created_at ASC, c.id ASC";
  if (sort === "upvotes") {
    return `(SELECT count(*) FROM complaint_upvotes uv WHERE uv.complaint_id = c.id) DESC,
            c.created_at DESC`;
  }
  if (sort === "priority") {
    return `CASE c.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
            c.created_at DESC`;
  }
  return "c.created_at DESC, c.id DESC";
};

export const list = async (filters = {}) => {
  const { page = 1, limit = 12 } = filters;
  const offset = (page - 1) * limit;

  const viewParams = [filters.actorId || ""];
  const whereSql = applyFilters(filters, viewParams);

  const { rows } = await query(
    `${VIEW_SELECT}
     ${whereSql}
     ORDER BY ${orderSql(filters.sort)}
     LIMIT $${viewParams.length + 1} OFFSET $${viewParams.length + 2}`,
    [...viewParams, limit, offset]
  );

  const countParams = [];
  const countWhereSql = applyFilters(filters, countParams);

  const countResult = await query(
    `SELECT count(*)::int AS total
     FROM complaints c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN wards w ON w.id = c.ward_id
     LEFT JOIN representatives r ON r.id = c.representative_id
     LEFT JOIN officers o ON o.id = c.assigned_officer_id
     LEFT JOIN users ou ON ou.id = o.user_id
     ${countWhereSql}`,
    countParams
  );

  const countsParams = [];
  const countsWhereSql = applyFilters({ ...filters, status: "" }, countsParams);

  const countRows = await query(
    `SELECT c.status, count(*)::int AS count
     FROM complaints c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN wards w ON w.id = c.ward_id
     LEFT JOIN representatives r ON r.id = c.representative_id
     LEFT JOIN officers o ON o.id = c.assigned_officer_id
     LEFT JOIN users ou ON ou.id = o.user_id
     ${countsWhereSql}
     GROUP BY c.status`,
    countsParams
  );

  const statusCounts = {};
  for (const row of countRows.rows) statusCounts[row.status] = row.count;

  return { rows, total: countResult.rows[0].total, statusCounts };
};

export const findView = async (id, actorId = "") => {
  const { rows } = await query(`${VIEW_SELECT} WHERE c.id = $2`, [actorId || "", id]);
  return rows[0] || null;
};

export const findRowById = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM complaints WHERE id = $1", [id]);
  return rows[0] || null;
};

export const create = async (complaint, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const [latitude, longitude] = complaint.position || [null, null];

  const { rows } = await exec(
    `INSERT INTO complaints
       (user_id, waste_type, complaint_category, complaint_type,
        description, address, ward_id, representative_id, assigned_officer_id,
        status, priority, image, latitude, longitude,
        ai_waste_type, ai_confidence, image_fingerprint, duplicate_of_id, duplicate_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      complaint.userId,
      complaint.wasteType,
      complaint.complaintCategory,
      complaint.complaintType,
      complaint.description,
      complaint.address,
      complaint.wardId || null,
      complaint.representativeId || null,
      complaint.assignedOfficerId || null,
      complaint.status || "Pending",
      complaint.priority || "Medium",
      complaint.image || "",
      latitude,
      longitude,
      complaint.aiWasteType || "",
      complaint.aiConfidence ?? null,
      complaint.imageFingerprint || "",
      complaint.duplicateOfId || null,
      complaint.duplicateScore ?? null,
    ]
  );
  return rows[0];
};

export const updateStatus = async (id, status, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    "UPDATE complaints SET status = $2 WHERE id = $1 RETURNING *",
    [id, status]
  );
  return rows[0] || null;
};

export const assign = async (id, changes, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const params = [id];
  const sets = [];

  if (changes.wardId !== undefined) {
    params.push(changes.wardId || null);
    sets.push(`ward_id = $${params.length}`);
  }

  if (changes.representativeId !== undefined) {
    params.push(changes.representativeId || null);
    sets.push(`representative_id = $${params.length}`);
  }

  if (changes.assignedOfficerId !== undefined) {
    params.push(changes.assignedOfficerId || null);
    sets.push(`assigned_officer_id = $${params.length}`);
  }

  if (!sets.length) return findRowById(id, db);

  const { rows } = await exec(
    `UPDATE complaints SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
};

/* ----------------------- officer assignment/workflow ------------------- */

export const closeActiveAssignments = async (complaintId, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec(
    `UPDATE complaint_assignments
     SET active = false, unassigned_at = now()
     WHERE complaint_id = $1 AND active = true`,
    [complaintId]
  );
};

export const recordAssignment = async (
  { complaintId, officerId, assignedBy, note = "" },
  db = null
) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO complaint_assignments (complaint_id, officer_id, assigned_by, note)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [complaintId, officerId, assignedBy || null, note]
  );
  return rows[0];
};

export const listAssignments = async (complaintId) => {
  const { rows } = await query(
    `SELECT ca.*, ou.name AS officer_name, u.name AS assigned_by_name
     FROM complaint_assignments ca
     JOIN officers o ON o.id = ca.officer_id
     JOIN users ou ON ou.id = o.user_id
     LEFT JOIN users u ON u.id = ca.assigned_by
     WHERE ca.complaint_id = $1
     ORDER BY ca.assigned_at ASC, ca.id ASC`,
    [complaintId]
  );
  return rows;
};

export const recordStatusHistory = async (
  { complaintId, fromStatus = "", toStatus, note = "", actorId, actorName, actorRole = "" },
  db = null
) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec(
    `INSERT INTO status_history
       (complaint_id, from_status, to_status, note, actor_id, actor_name, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [complaintId, fromStatus || "", toStatus, note || "", actorId || null, actorName || "System", actorRole]
  );
};

export const listStatusHistory = async (complaintId) => {
  const { rows } = await query(
    `SELECT * FROM status_history
     WHERE complaint_id = $1
     ORDER BY created_at ASC, id ASC`,
    [complaintId]
  );
  return rows;
};

export const updateOfficerWork = async (id, { beforePhoto, afterPhoto, workNotes }, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const params = [id];
  const sets = [];

  if (beforePhoto !== undefined) {
    params.push(beforePhoto || "");
    sets.push(`before_photo = $${params.length}`);
  }
  if (afterPhoto !== undefined) {
    params.push(afterPhoto || "");
    sets.push(`after_photo = $${params.length}`);
  }
  if (workNotes !== undefined) {
    params.push(workNotes || "");
    sets.push(`work_notes = $${params.length}`);
  }

  if (!sets.length) return findRowById(id, db);

  const { rows } = await exec(
    `UPDATE complaints SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
};

/** Apply a lifecycle transition together with its verification bookkeeping. */
export const updateWorkflow = async (id, changes, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const params = [id];
  const sets = [];

  if (changes.status !== undefined) {
    params.push(changes.status);
    sets.push(`status = $${params.length}`);
  }
  if (changes.verificationStatus !== undefined) {
    params.push(changes.verificationStatus);
    sets.push(`verification_status = $${params.length}`);
  }
  if (changes.beforePhoto !== undefined) {
    params.push(changes.beforePhoto || "");
    sets.push(`before_photo = $${params.length}`);
  }
  if (changes.afterPhoto !== undefined) {
    params.push(changes.afterPhoto || "");
    sets.push(`after_photo = $${params.length}`);
  }
  if (changes.workNotes !== undefined) {
    params.push(changes.workNotes || "");
    sets.push(`work_notes = $${params.length}`);
  }

  for (const column of ["resolved_at", "closed_at", "reopened_at", "verified_at"]) {
    if (changes[column] === undefined) continue;
    if (changes[column] === null) {
      sets.push(`${column} = NULL`);
    } else {
      params.push(changes[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  if (!sets.length) return findRowById(id, db);

  const { rows } = await exec(
    `UPDATE complaints SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
};

export const findAssignedToOfficer = async (id, officerId, actorId = "") => {
  const row = await findView(id, actorId);
  if (!row) return null;
  return row.assigned_officer_id === officerId ? row : null;
};

export const toggleUpvote = async (id, userId) => {
  const inserted = await query(
    `INSERT INTO complaint_upvotes (complaint_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING 1`,
    [id, userId]
  );

  if (inserted.rowCount > 0) return { added: true };

  await query("DELETE FROM complaint_upvotes WHERE complaint_id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return { added: false };
};

export const addComment = async (id, userId, body) => {
  const { rows } = await query(
    `INSERT INTO complaint_comments (complaint_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, userId, body]
  );
  return rows[0];
};

export const listComments = async (id) => {
  const { rows } = await query(
    `SELECT cc.*, u.name AS user_name
     FROM complaint_comments cc
     JOIN users u ON u.id = cc.user_id
     WHERE cc.complaint_id = $1
     ORDER BY cc.created_at ASC, cc.id ASC`,
    [id]
  );
  return rows;
};

export const addTimelineEntry = async (id, { status, note, by }, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec(
    `INSERT INTO complaint_timeline (complaint_id, status, note, actor_name)
     VALUES ($1, $2, $3, $4)`,
    [id, status, note || "", by || "System"]
  );
};

export const listTimeline = async (id) => {
  const { rows } = await query(
    `SELECT * FROM complaint_timeline
     WHERE complaint_id = $1
     ORDER BY created_at ASC, id ASC`,
    [id]
  );
  return rows;
};

export const listTimelineForMany = async (ids = []) => {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT * FROM complaint_timeline
     WHERE complaint_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [ids]
  );
  return rows;
};

export const myStats = async (userId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('Pending', 'Accepted', 'Assigned'))::int AS pending,
            count(*) FILTER (WHERE status IN ('In-Progress', 'Reopened'))::int AS in_progress,
            count(*) FILTER (
              WHERE status IN ('Resolved', 'Citizen Verification', 'Closed')
            )::int AS resolved,
            count(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
                FILTER (WHERE status IN ('Resolved', 'Citizen Verification', 'Closed')),
              0
            ) AS average_days
     FROM complaints WHERE user_id = $1`,
    [userId]
  );

  const upvotes = await query(
    `SELECT count(*)::int AS total
     FROM complaint_upvotes uv
     JOIN complaints c ON c.id = uv.complaint_id
     WHERE c.user_id = $1`,
    [userId]
  );

  return {
    counts: rows[0],
    upvotesReceived: upvotes.rows[0].total,
  };
};

export const analyticsTotals = async () => {
  const { rows } = await query(
    `SELECT count(*)::int AS complaints,
            count(*) FILTER (WHERE status = 'Pending')::int AS pending,
            count(*) FILTER (WHERE status = 'Accepted')::int AS accepted,
            count(*) FILTER (WHERE status = 'Assigned')::int AS assigned,
            count(*) FILTER (WHERE status = 'In-Progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'Resolved')::int AS resolved,
            count(*) FILTER (WHERE status = 'Citizen Verification')::int AS citizen_verification,
            count(*) FILTER (WHERE status = 'Closed')::int AS closed,
            count(*) FILTER (WHERE status = 'Reopened')::int AS reopened,
            count(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
                FILTER (WHERE status IN ('Resolved', 'Citizen Verification', 'Closed')),
              0
            ) AS average_resolution_days
     FROM complaints`
  );

  const upvotes = await query("SELECT count(*)::int AS total FROM complaint_upvotes");

  return { ...rows[0], upvotes: upvotes.rows[0].total };
};

export const countByWaste = async () => {
  const { rows } = await query(
    `SELECT waste_type, count(*)::int AS count
     FROM complaints GROUP BY waste_type`
  );
  return rows;
};

/**
 * Complaint totals per civic category. Legacy rows created before the category
 * rollout are counted as garbage complaints so no data disappears from charts.
 */
export const countByCategory = async () => {
  const { rows } = await query(
    `SELECT COALESCE(complaint_category, 'garbage-collection') AS complaint_category,
            count(*)::int AS count
     FROM complaints
     GROUP BY COALESCE(complaint_category, 'garbage-collection')`
  );
  return rows;
};

export const wardBreakdown = async () => {
  const { rows } = await query(
    `SELECT w.name, w.area,
            count(c.id)::int AS total,
            count(c.id) FILTER (WHERE c.status = 'Resolved')::int AS resolved
     FROM wards w
     LEFT JOIN complaints c ON c.ward_id = w.id
     GROUP BY w.id, w.name, w.area
     ORDER BY total DESC, w.name ASC`
  );
  return rows;
};

export const createdSince = async (since) => {
  const { rows } = await query(
    "SELECT created_at FROM complaints WHERE created_at >= $1",
    [since]
  );
  return rows.map((row) => row.created_at);
};

export const topComplaints = async (actorId, limit = 5) => {
  const { rows } = await query(
    `${VIEW_SELECT}
     ORDER BY (SELECT count(*) FROM complaint_upvotes uv WHERE uv.complaint_id = c.id) DESC,
              c.created_at DESC
     LIMIT $2`,
    [actorId || "", limit]
  );
  return rows;
};

/* ------------------- advanced analytics and verification -------------- */

export const monthlyCounts = async (months = 12) => {
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            count(*)::int AS total,
            count(*) FILTER (
              WHERE status IN ('Resolved', 'Citizen Verification', 'Closed')
            )::int AS resolved
     FROM complaints
     WHERE created_at >= date_trunc('month', now()) - make_interval(months => $1::int - 1)
     GROUP BY 1
     ORDER BY 1 ASC`,
    [months]
  );
  return rows;
};

export const dailyCounts = async (days = 14) => {
  const { rows } = await query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            count(*)::int AS total
     FROM complaints
     WHERE created_at >= date_trunc('day', now()) - make_interval(days => $1::int - 1)
     GROUP BY 1
     ORDER BY 1 ASC`,
    [days]
  );
  return rows;
};

export const officerPerformance = async () => {
  const { rows } = await query(
    `SELECT o.id, ou.name AS officer_name, o.employee_code, o.zone,
            count(c.id)::int AS total,
            count(c.id) FILTER (
              WHERE c.status IN ('Resolved', 'Citizen Verification', 'Closed')
            )::int AS resolved,
            count(c.id) FILTER (
              WHERE c.status IN ('In-Progress', 'Reopened')
            )::int AS in_progress,
            count(c.id) FILTER (
              WHERE c.status IN ('Pending', 'Accepted', 'Assigned')
            )::int AS pending,
            COALESCE(
              round(avg(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)::numeric, 1),
              0
            )::float AS average_days
     FROM officers o
     JOIN users ou ON ou.id = o.user_id
     LEFT JOIN complaints c ON c.assigned_officer_id = o.id
     WHERE o.is_active = true
     GROUP BY o.id, ou.name, o.employee_code, o.zone
     ORDER BY resolved DESC, total DESC, ou.name ASC`
  );
  return rows;
};

export const resolutionBuckets = async () => {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (
         WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 <= 1
       )::int AS within_1,
       count(*) FILTER (
         WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 > 1
           AND EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 <= 3
       )::int AS within_3,
       count(*) FILTER (
         WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 > 3
           AND EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 <= 7
       )::int AS within_7,
       count(*) FILTER (
         WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at, updated_at) - created_at)) / 86400 > 7
       )::int AS over_7
     FROM complaints
     WHERE status IN ('Resolved', 'Citizen Verification', 'Closed')`
  );
  return rows[0] || { within_1: 0, within_3: 0, within_7: 0, over_7: 0 };
};

export const listOpenByCategory = async (categoryId, actorId = "", limit = 60) => {
  const { rows } = await query(
    `${VIEW_SELECT}
     WHERE COALESCE(c.complaint_category, 'garbage-collection') = $2
       AND c.status NOT IN ('Rejected', 'Closed')
       AND c.created_at >= now() - interval '60 days'
     ORDER BY c.created_at DESC
     LIMIT $3`,
    [actorId || "", categoryId, limit]
  );
  return rows;
};

/**
 * Nearby open complaints of the same category, used by duplicate detection.
 * The haversine distance is computed in SQL so large tables do not have to be
 * streamed into the API process, then the service keeps only close matches.
 */
export const findDuplicateCandidates = async ({
  categoryId = "",
  position = null,
  days = 30,
  limit = 12,
  excludeId = "",
} = {}) => {
  const [latitude, longitude] = Array.isArray(position) ? position.map(Number) : [];
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);

  const params = [categoryId || "", excludeId || "", Math.min(Math.max(days, 1), 180), limit];
  const distanceSql = hasPoint
    ? `(6371 * acos(least(1, greatest(-1,
         cos(radians($5)) * cos(radians(c.latitude)) *
         cos(radians(c.longitude) - radians($6)) +
         sin(radians($5)) * sin(radians(c.latitude))
       ))))`
    : "NULL";

  if (hasPoint) params.push(latitude, longitude);

  const { rows } = await query(
    `SELECT c.*, u.name AS user_name,
            w.name AS ward_name,
            ${distanceSql} AS distance_km
     FROM complaints c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN wards w ON w.id = c.ward_id
     WHERE COALESCE(c.complaint_category, 'garbage-collection') = $1
       AND c.status NOT IN ('Rejected', 'Closed')
       AND c.created_at >= now() - make_interval(days => $3::int)
       AND c.id <> $2
       ${hasPoint ? "AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL" : ""}
     ORDER BY ${hasPoint ? "distance_km ASC" : "c.created_at DESC"}
     LIMIT $4`,
    params
  );

  return rows;
};

export const recordVerification = async (
  { complaintId, decision, note = "", actorId, actorName, actorRole = "" },
  db = null
) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec(
    `INSERT INTO verification_history
       (complaint_id, decision, note, actor_id, actor_name, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [complaintId, decision, note || "", actorId || null, actorName || "System", actorRole]
  );
};

export const listVerificationHistory = async (complaintId) => {
  const { rows } = await query(
    `SELECT * FROM verification_history
     WHERE complaint_id = $1
     ORDER BY created_at ASC, id ASC`,
    [complaintId]
  );
  return rows;
};
