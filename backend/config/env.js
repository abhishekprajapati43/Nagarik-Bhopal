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

if (!process.env.AADHAAR_ENCRYPTION_KEY) {
  console.warn(
    "[config] AADHAAR_ENCRYPTION_KEY is not set - deriving the Aadhaar encryption key from JWT_SECRET. Set a dedicated key before production."
  );
}

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

  /**
   * Aadhaar numbers are encrypted with AES-256-GCM before they reach the
   * database and duplicate checks use a keyed HMAC hash. Set both secrets in
   * production; otherwise they are derived from JWT_SECRET so a demo install
   * keeps working without extra configuration.
   */
  aadhaar: Object.freeze({
    encryptionKey: process.env.AADHAAR_ENCRYPTION_KEY || "",
    lookupKey: process.env.AADHAAR_LOOKUP_KEY || "",
  }),

  /**
   * Optional SMTP transport for automatic complaint emails. When host/user are
   * missing, emails are still written to the `email_outbox` table and logged so
   * no notification is lost, but nothing leaves the machine.
   */
  smtp: Object.freeze({
    host: process.env.SMTP_HOST || "",
    port: toPositiveInt(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "Nagarik Bhopal <care@nagarik.bhopal>",
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  }),

  /**
   * Optional waste-classification endpoint. When WASTE_AI_URL is unset the
   * service falls back to the built-in heuristic, so the UI always receives a
   * prediction and manual submission is never blocked.
   */
  wasteAi: Object.freeze({
    url: process.env.WASTE_AI_URL || "",
    key: process.env.WASTE_AI_KEY || "",
    enabled: Boolean(process.env.WASTE_AI_URL),
  }),

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
