import { DEFAULT_SETTINGS } from "../../shared/constants.js";
import { query } from "../config/database.js";

export const get = async () => {
  const { rows } = await query("SELECT value FROM app_settings WHERE id = 1");
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}) };
};

export const save = async (patch) => {
  const { rows } = await query(
    `INSERT INTO app_settings (id, value)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET value = app_settings.value || EXCLUDED.value
     RETURNING value`,
    [JSON.stringify(patch)]
  );

  return { ...DEFAULT_SETTINGS, ...rows[0].value };
};
