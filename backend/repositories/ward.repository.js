import { query } from "../config/database.js";

/**
 * Ward master reads always join the optional representative satellite (office
 * address, email and MLA name) and the assigned sanitation officer. Complaint
 * totals are computed per ward so the admin console and analytics can show the
 * master record and its live load in one request.
 */
const WITH_COUNTS = `
  SELECT w.*,
         COALESCE(NULLIF(w.councillor_name, ''), r.name, '') AS councillor_display_name,
         COALESCE(NULLIF(w.councillor_mobile, ''), r.phone, '') AS councillor_display_mobile,
         r.name AS representative_name,
         r.designation AS representative_designation,
         r.phone AS representative_phone,
         r.email AS representative_email,
         r.mla_name AS representative_mla,
         r.office_address AS representative_office,
         o.employee_code AS officer_code,
         o.phone AS officer_phone,
         ou.name AS officer_name,
         (SELECT count(*) FROM complaints c WHERE c.ward_id = w.id)::int AS complaint_count,
         (SELECT count(*) FROM complaints c
          WHERE c.ward_id = w.id
            AND c.status IN ('Resolved', 'Citizen Verification', 'Closed'))::int AS resolved_count,
         (SELECT count(*) FROM complaints c
          WHERE c.ward_id = w.id
            AND c.status IN ('Pending', 'Accepted', 'Assigned', 'In-Progress', 'Reopened'))::int
           AS pending_count,
         (SELECT COALESCE(
            round(avg(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)::numeric, 1),
            0
          )::float
          FROM complaints c
          WHERE c.ward_id = w.id AND c.resolved_at IS NOT NULL) AS average_resolution_days
  FROM wards w
  LEFT JOIN representatives r ON r.id = w.representative_id
  LEFT JOIN officers o ON o.id = w.assigned_officer_id
  LEFT JOIN users ou ON ou.id = o.user_id
`;

const applyFilters = (filters = {}, params = []) => {
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = [];

  if (filters.search) {
    const like = add(`%${String(filters.search).trim().toLowerCase()}%`);
    const digits = add(`%${String(filters.search).replace(/\D/g, "")}%`);
    where.push(`(
      w.ward_number::text LIKE ${like}
      OR lower(w.name) LIKE ${like}
      OR lower(w.area) LIKE ${like}
      OR lower(w.zone) LIKE ${like}
      OR lower(w.assembly_constituency) LIKE ${like}
      OR lower(w.councillor_name) LIKE ${like}
      OR regexp_replace(COALESCE(w.councillor_mobile, ''), '[^0-9]', '', 'g') LIKE ${digits}
    )`);
  }

  if (filters.wardNumber) where.push(`w.ward_number = ${add(Number(filters.wardNumber))}`);
  if (filters.zoneNumber) where.push(`w.zone_number = ${add(Number(filters.zoneNumber))}`);
  if (filters.assemblyConstituency) {
    where.push(`lower(w.assembly_constituency) = ${add(String(filters.assemblyConstituency).toLowerCase())}`);
  }
  if (filters.assignedOfficerId) {
    where.push(`w.assigned_officer_id = ${add(String(filters.assignedOfficerId))}`);
  }
  if (filters.unassignedOfficer) where.push("w.assigned_officer_id IS NULL");

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
};

export const list = async (filters = {}) => {
  const params = [];
  const whereSql = applyFilters(filters, params);
  const { rows } = await query(
    `${WITH_COUNTS}
     ${whereSql}
     ORDER BY COALESCE(w.ward_number, 9999) ASC, w.name ASC`,
    params
  );
  return rows;
};

export const findById = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(`${WITH_COUNTS} WHERE w.id = $1`, [id]);
  return rows[0] || null;
};

export const findRowById = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM wards WHERE id = $1", [id]);
  return rows[0] || null;
};

export const findByName = async (name, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM wards WHERE lower(name) = lower($1)", [name]);
  return rows[0] || null;
};

export const findByNumber = async (wardNumber, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM wards WHERE ward_number = $1", [
    Number(wardNumber),
  ]);
  return rows[0] || null;
};

export const create = async (ward, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO wards (
       name, area, zone, zone_number, ward_number, assembly_constituency,
       councillor_name, councillor_mobile, population, center_lat, center_lng,
       representative_id, assigned_officer_id, is_default
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      ward.name,
      ward.area,
      ward.zone,
      ward.zoneNumber,
      ward.wardNumber,
      ward.assemblyConstituency,
      ward.councillorName,
      ward.councillorMobile,
      ward.population,
      ward.center[0],
      ward.center[1],
      ward.representativeId || null,
      ward.assignedOfficerId || null,
      Boolean(ward.isDefault),
    ]
  );
  return rows[0];
};

export const update = async (id, ward, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `UPDATE wards
     SET name = $2, area = $3, zone = $4, zone_number = $5, ward_number = $6,
         assembly_constituency = $7, councillor_name = $8, councillor_mobile = $9,
         population = $10, center_lat = $11, center_lng = $12,
         representative_id = $13, assigned_officer_id = $14
     WHERE id = $1
     RETURNING *`,
    [
      id,
      ward.name,
      ward.area,
      ward.zone,
      ward.zoneNumber,
      ward.wardNumber,
      ward.assemblyConstituency,
      ward.councillorName,
      ward.councillorMobile,
      ward.population,
      ward.center[0],
      ward.center[1],
      ward.representativeId || null,
      ward.assignedOfficerId || null,
    ]
  );
  return rows[0] || null;
};

/** Quick assignment endpoint: only the officer/representative pointers change. */
export const assign = async (id, { officerId, representativeId }, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `UPDATE wards
     SET assigned_officer_id = $2, representative_id = $3
     WHERE id = $1
     RETURNING *`,
    [id, officerId || null, representativeId || null]
  );
  return rows[0] || null;
};

export const countComplaints = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    "SELECT count(*)::int AS total FROM complaints WHERE ward_id = $1",
    [id]
  );
  return rows[0].total;
};

export const clearAssignments = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  await exec("UPDATE representatives SET ward_id = NULL WHERE ward_id = $1", [id]);
};

export const remove = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const result = await exec("DELETE FROM wards WHERE id = $1", [id]);
  return result.rowCount > 0;
};

/** Every ward + live complaint load, used by analytics and the heat map. */
export const wardStats = async () => {
  const { rows } = await query(
    `SELECT w.id, w.ward_number, w.name, w.area, w.zone, w.zone_number,
            w.assembly_constituency, w.councillor_name, w.councillor_mobile,
            w.center_lat, w.center_lng, w.assigned_officer_id, w.is_default,
            count(c.id)::int AS total,
            count(c.id) FILTER (
              WHERE c.status IN ('Pending', 'Accepted', 'Assigned', 'In-Progress', 'Reopened')
            )::int AS pending,
            count(c.id) FILTER (
              WHERE c.status IN ('Resolved', 'Citizen Verification', 'Closed')
            )::int AS resolved,
            COALESCE(
              round(avg(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)::numeric, 1),
              0
            )::float AS average_days,
            COALESCE((
              SELECT cc.complaint_category
              FROM complaints cc
              WHERE cc.ward_id = w.id
              GROUP BY cc.complaint_category
              ORDER BY count(*) DESC, cc.complaint_category ASC
              LIMIT 1
            ), '') AS top_category
     FROM wards w
     LEFT JOIN complaints c ON c.ward_id = w.id
     GROUP BY w.id
     ORDER BY COALESCE(w.ward_number, 9999) ASC, w.name ASC`
  );
  return rows;
};

/** Officer load grouped by ward zone, used by the admin dashboard. */
export const zoneStats = async () => {
  const { rows } = await query(
    `SELECT w.zone_number, w.zone,
            count(DISTINCT w.id)::int AS wards,
            count(c.id)::int AS total,
            count(c.id) FILTER (
              WHERE c.status IN ('Resolved', 'Citizen Verification', 'Closed')
            )::int AS resolved
     FROM wards w
     LEFT JOIN complaints c ON c.ward_id = w.id
     GROUP BY w.zone_number, w.zone
     ORDER BY w.zone_number NULLS LAST, w.zone ASC`
  );
  return rows;
};
