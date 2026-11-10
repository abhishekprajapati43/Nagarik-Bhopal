import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { env } from "../config/env.js";

const buckets = new Map();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000);

cleanup.unref?.();

/**
 * Small dependency-free fixed-window limiter, keyed per IP and bucket.
 * Fine for a single API process; swap for a shared store if you scale out.
 */
export const rateLimit = ({ name, max, windowMs = env.rateLimit.windowMs }) => (req, _res, next) => {
  if (!env.rateLimit.enabled) return next();

  const key = `${name}:${req.ip}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  entry.count += 1;

  if (entry.count > max) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const error = new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many requests. Please wait a moment and try again."
    );
    error.retryAfter = retryAfter;
    return next(error);
  }

  return next();
};

export const authLimiter = rateLimit({ name: "auth", max: env.rateLimit.authMax });
export const uploadLimiter = rateLimit({ name: "upload", max: env.rateLimit.uploadMax });
export const globalLimiter = rateLimit({ name: "global", max: env.rateLimit.max });

export default { rateLimit, authLimiter, uploadLimiter, globalLimiter };
