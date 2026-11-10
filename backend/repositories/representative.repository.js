import { query } from "../config/database.js";

const WITH_COUNTS = `
  SELECT rp.*, w.name AS ward_name,
         (SELECT count(*) FROM complaints c WHERE c.representative_id = rp.id)::int AS complaint_count
  FROM representatives rp
  LEFT JOIN wards w ON w.id = rp.ward_id
`;

export const list = async () => {
  const { rows } = await query(`${WITH_COUNTS} ORDER BY rp.name ASC`);
  return rows;
};

export const findById = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(`${WITH_COUNTS} WHERE rp.id = $1`, [id]);
  return rows[0] || null;
};

export const findRowById = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec("SELECT * FROM representatives WHERE id = $1", [id]);
  return rows[0] || null;
};

export const create = async (person, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `INSERT INTO representatives (name, designation, phone, email, ward_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      person.name,
      person.designation || "Ward Corporator",
      person.phone || "",
      person.email || "",
      person.wardId || null,
    ]
  );
  return rows[0];
};

export const update = async (id, person, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await exec(
    `UPDATE representatives
     SET name = $2, designation = $3, phone = $4, email = $5, ward_id = $6
     WHERE id = $1
     RETURNING *`,
    [
      id,
      person.name,
      person.designation || "Ward Corporator",
      person.phone || "",
      person.email || "",
      person.wardId || null,
    ]
  );
  return rows[0] || null;
};

export const remove = async (id, db = null) => {
  const exec = db ? (sql, params) => db.query(sql, params) : query;
  const result = await exec("DELETE FROM representatives WHERE id = $1", [id]);
  return result.rowCount > 0;
};
