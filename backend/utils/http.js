import { logger } from "./logger.js";

/** Wrap async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const sendOk = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const sendCreated = (res, data) => sendOk(res, data, 201);

export const sendMessage = (res, message, data = undefined) =>
  res.json({ success: true, message, ...(data === undefined ? {} : { data }) });

export const getRequestContext = (req) => ({
  ip: req.ip || "",
  userAgent: String(req.get("user-agent") || "").slice(0, 300),
});

export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

export const logStartupWarning = (message) => logger.warn(message);

export default { asyncHandler, sendOk, sendCreated, sendMessage, getRequestContext, notFoundHandler };
