import { env } from "../config/env.js";
import { closeDatabase } from "../config/database.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";
import { logger } from "../utils/logger.js";

/**
 * CLI entry point: npm run db:setup
 * Creates every table (via the migration runner) and inserts the first-run
 * dataset when the database has no accounts yet.
 */
const main = async () => {
  logger.info("Preparing database", {
    host: env.db.host,
    port: env.db.port,
    database: env.db.database,
  });

  await migrate();
  const result = await seed();

  logger.info(result.seeded ? "Database ready" : "Database already contains data - seed skipped");
};

main()
  .catch((error) => {
    logger.error("Database setup failed", { error: error.message, code: error.code });
    process.exitCode = 1;
  })
  .finally(() => closeDatabase().catch(() => {}));
