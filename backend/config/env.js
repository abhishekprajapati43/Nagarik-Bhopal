import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_JWT_SECRET } from "../../shared/constants.js";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT_DIR = path.resolve(BACKEND_DIR, "..");

const isProduction = (process.env.NODE_ENV || "development") === "production";

const toBool = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toCsv = (value, fallback) => {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

let jwtSecret = process.env.JWT_SECRET || "";

if (isProduction) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to a random value of at least 32 characters in production."
    );
  }
} else if (!jwtSecret) {
  jwtSecret = DEMO_JWT_SECRET;
  console.warn(
    "[config] JWT_SECRET is not set - falling back to the public demo secret. Set a private secret before deploying."
  );
} else if (jwtSecret.length < 32) {
  console.warn(
    "[config] JWT_SECRET is shorter than 32 characters. Use a longer random secret before deploying."
  );
}

const port = toPositiveInt(process.env.PORT, 5000);

const defaultOrigins = [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port,
  trustProxy: toBool(process.env.TRUST_PROXY, false),

  jwtSecret,
  jwtIssuer: "nagarik-bhopal-api",
  bodyLimit: process.env.BODY_LIMIT || "4mb",

  corsOrigins: toCsv(process.env.CORS_ORIGIN, defaultOrigins),

  db: Object.freeze({
    host: process.env.DB_HOST || "localhost",
    port: toPositiveInt(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || "clean_bhopal_db",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    ssl: toBool(process.env.DB_SSL, false),
    poolMax: toPositiveInt(process.env.DB_POOL_MAX, 10),
    connectionTimeoutMs: toPositiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 5000),
  }),

  uploads: Object.freeze({
    directory: process.env.UPLOAD_DIR
      ? path.resolve(ROOT_DIR, process.env.UPLOAD_DIR)
      : path.join(BACKEND_DIR, "storage", "uploads"),
    publicPath: "/uploads",
    maxBytes: toPositiveInt(process.env.MAX_UPLOAD_BYTES, 2_000_000),
    allowedMimeTypes: Object.freeze([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]),
  }),

  resetTokenTtlMinutes: toPositiveInt(process.env.RESET_TOKEN_TTL_MINUTES, 30),
  exposeResetToken: toBool(process.env.EXPOSE_RESET_TOKEN, !isProduction),

  rateLimit: Object.freeze({
    enabled: toBool(process.env.RATE_LIMIT_ENABLED, true),
    windowMs: toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toPositiveInt(process.env.RATE_LIMIT_MAX, 1200),
    authMax: toPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 25),
    uploadMax: toPositiveInt(process.env.UPLOAD_RATE_LIMIT_MAX, 60),
  }),

  logLevel: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
});

export default env;
