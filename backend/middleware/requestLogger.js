import crypto from "node:crypto";
import { logger } from "../utils/logger.js";

/** Attach a request id, log the completed request and expose it to clients. */
export const requestLogger = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.id = incoming ? String(incoming).slice(0, 100) : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
    };

    if (req.user?.id) meta.userId = req.user.id;

    if (res.statusCode >= 500) logger.error("request", meta);
    else if (res.statusCode >= 400) logger.warn("request", meta);
    else logger.info("request", meta);
  });

  next();
};

export default requestLogger;
