import pg from "pg";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  max: env.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: env.db.connectionTimeoutMs,
  application_name: "nagarik-bhopal-api",
});

pool.on("error", (error) => {
  logger.error("Unexpected PostgreSQL pool error", {
    error: error.message,
    code: error.code,
  });
});

/** Run a parameterized query and log slow or failing statements. */
export const query = async (text, params = []) => {
  const startedAt = Date.now();

  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - startedAt;

    if (durationMs > 500) {
      logger.debug("Slow query", { durationMs, statement: text.slice(0, 240) });
    }

    return result;
  } catch (error) {
    logger.error("Database query failed", {
      error: error.message,
      code: error.code,
      constraint: error.constraint,
      statement: text.slice(0, 240),
    });
    throw error;
  }
};

/** Run work inside a transaction, rolling back on any failure. */
export const withTransaction = async (work) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const checkDatabase = async () => {
  const { rows } = await pool.query("SELECT now() AS server_time");
  return rows[0].server_time;
};

export const closeDatabase = async () => {
  await pool.end();
};
