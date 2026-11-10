import { query } from "../config/database.js";

const VIEW_SELECT = `
  SELECT c.*, u.name AS user_name, u.email AS user_email,
         w.name AS ward_name, w.zone AS ward_zone,
         r.name AS representative_name,
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
  if (filters.wasteType) where.push(`c.waste_type = ${add(filters.wasteType)}`);
  if (filters.wardId) where.push(`c.ward_id = ${add(filters.wardId)}`);
  if (filters.priority) where.push(`c.priority = ${add(filters.priority)}`);
  if (filters.representativeId) {
    where.push(`c.representative_id = ${add(filters.representativeId)}`);
  }
  if (filters.from) where.push(`c.created_at >= ${add(filters.from)}`);
  if (filters.to) where.push(`c.created_at <= ${add(filters.to)}`);

  if (filters.search) {
    const like = add(`%${String(filters.search).toLowerCase()}%`);
    where.push(`(
      lower(c.id) LIKE ${like}
      OR lower(c.address) LIKE ${like}
      OR lower(c.description) LIKE ${like}
      OR lower(c.waste_type) LIKE ${like}
      OR lower(u.name) LIKE ${like}
      OR lower(COALESCE(w.name, '')) LIKE ${like}
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
       (user_id, waste_type, description, address, ward_id, representative_id,
        status, priority, image, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      complaint.userId,
      complaint.wasteType,
      complaint.description,
      complaint.address,
      complaint.wardId || null,
      complaint.representativeId || null,
      complaint.status || "Pending",
      complaint.priority || "Medium",
      complaint.image || "",
      latitude,
      longitude,
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

  if (!sets.length) return findRowById(id, db);

  const { rows } = await exec(
    `UPDATE complaints SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
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
            count(*) FILTER (WHERE status = 'Pending')::int AS pending,
            count(*) FILTER (WHERE status = 'In-Progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'Resolved')::int AS resolved,
            count(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
                FILTER (WHERE status = 'Resolved'),
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
            count(*) FILTER (WHERE status = 'In-Progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'Resolved')::int AS resolved,
            count(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
                FILTER (WHERE status = 'Resolved'),
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
