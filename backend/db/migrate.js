import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, checkDatabase } from "../config/database.js";
import { logger } from "../utils/logger.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  { version: "001_initial_schema", file: "schema.sql" },
];

const LOCK_KEY = "nagarik_bhopal_migrations";

/**
 * Apply pending migrations. A PostgreSQL advisory lock keeps two API
 * processes from racing while the schema is created.
 */
export async function migrate({ silent = false } = {}) {
  await checkDatabase();

  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of MIGRATIONS) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [migration.version]
      );

      if (applied.rowCount > 0) {
        if (!silent) logger.debug("Migration already applied", { version: migration.version });
        continue;
      }

      const sql = await fs.readFile(path.join(HERE, migration.file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
          migration.version,
        ]);
        await client.query("COMMIT");
        logger.info("Migration applied", { version: migration.version });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY])
      .catch(() => {});
    client.release();
  }
}

export default migrate;
