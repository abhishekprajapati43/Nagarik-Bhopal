import { query } from "../config/database.js";

const WITH_COUNTS = `
  SELECT w.*, r.name AS representative_name,
         (SELECT count(*) FROM complaints c WHERE c.ward_id = w.id)::int AS complaint_count,
         (SELECT count(*) FROM complaints c WHERE c.ward_id = w.id AND c.status = 'Resolved')::int AS resolved_count
  FROM wards w
  LEFT JOIN representatives r ON r.id = w.representative_id
`;

export const list = async () => {
  const { rows } = await query(`${WITH_COUNTS} ORDER BY w.name ASC`);
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

export const findByName = async (name) => {
  const { rows } = await query("SELECT * FROM wards WHERE lower(name) = lower($1)", [name]);
  return rows[0] || null;
};

export const create = async (ward, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO wards (name, area, zone, center_lat, center_lng, representative_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      ward.name,
      ward.area,
      ward.zone,
      ward.center[0],
      ward.center[1],
      ward.representativeId || null,
    ]
  );
  return rows[0];
};

export const update = async (id, ward, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `UPDATE wards
     SET name = $2, area = $3, zone = $4, center_lat = $5, center_lng = $6, representative_id = $7
     WHERE id = $1
     RETURNING *`,
    [
      id,
      ward.name,
      ward.area,
      ward.zone,
      ward.center[0],
      ward.center[1],
      ward.representativeId || null,
    ]
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
