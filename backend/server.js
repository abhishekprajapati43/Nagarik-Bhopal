import app from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase, pool } from "./config/database.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { logger } from "./utils/logger.js";

let server = null;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("Shutting down", { signal });

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await closeDatabase().catch((error) => {
    logger.warn("Database pool did not close cleanly", { error: error.message });
  });

  process.exit(0);
};

const start = async () => {
  await pool.query("SELECT 1");

  await migrate();
  await seed();

  server = app.listen(env.port, () => {
    logger.info("Nagarik Bhopal API listening", {
      url: `http://localhost:${env.port}`,
      environment: env.nodeEnv,
      database: `${env.db.host}:${env.db.port}/${env.db.database}`,
    });
  });

  server.on("error", (error) => {
    logger.error("HTTP server error", { error: error.message, code: error.code });
    process.exitCode = 1;
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch(async (error) => {
  logger.error("Could not start the API", {
    error: error.message,
    code: error.code,
    hint:
      error.code === "ECONNREFUSED" || error.code === "28P01"
        ? "Check DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD, and that PostgreSQL is running."
        : undefined,
  });

  await closeDatabase().catch(() => {});
  process.exit(1);
});
