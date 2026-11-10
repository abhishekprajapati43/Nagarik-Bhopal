import { env } from "../config/env.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SECRET_KEY = /pass(word|wd)?|token|authorization|secret|api[-_]?key|cookie/i;

const redact = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code };
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? "[redacted]" : redact(item, depth + 1),
      ])
    );
  }
  return value;
};

const threshold = LEVELS[env.logLevel] ?? LEVELS.info;

const write = (level, message, meta) => {
  if ((LEVELS[level] ?? LEVELS.info) > threshold) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta !== undefined) entry.meta = redact(meta);

  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export const logger = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
  level: env.logLevel,
};

export default logger;
