import { query } from "../config/database.js";

export const create = async (file) => {
  const { rows } = await query(
    `INSERT INTO uploads (user_id, filename, original_name, mime_type, size_bytes, url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [file.userId || null, file.filename, file.originalName || "", file.mimeType, file.sizeBytes, file.url]
  );
  return rows[0];
};

export const findById = async (id) => {
  const { rows } = await query("SELECT * FROM uploads WHERE id = $1", [id]);
  return rows[0] || null;
};

export const remove = async (id) => {
  const { rows } = await query("DELETE FROM uploads WHERE id = $1 RETURNING *", [id]);
  return rows[0] || null;
};
