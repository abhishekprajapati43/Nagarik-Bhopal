import multer from "multer";
import { AppError, ERROR_CODES, httpStatusFor } from "../../shared/errors.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const fromPostgres = (error) => {
  if (error.code === "23505") {
    return {
      status: 409,
      code: ERROR_CODES.CONFLICT,
      message: "That value is already in use. Please choose another.",
    };
  }

  if (error.code === "23503") {
    return {
      status: 409,
      code: ERROR_CODES.CONFLICT,
      message: "That record is still referenced elsewhere and cannot be changed.",
    };
  }

  if (error.code === "23514" || error.code === "22P02") {
    return {
      status: 400,
      code: ERROR_CODES.VALIDATION,
      message: "One of the submitted values is not valid.",
    };
  }

  return null;
};

export const errorHandler = (error, req, res, _next) => {
  let status = 500;
  let code = ERROR_CODES.INTERNAL;
  let message = "Something went wrong. Please try again.";
  let details = null;

  if (error instanceof AppError) {
    status = httpStatusFor(error.code);
    code = error.code;
    message = error.message;

    if (error.details) details = error.details;
  } else if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      status = 413;
      code = ERROR_CODES.PAYLOAD_TOO_LARGE;
      message = `That image is too large. The limit is ${Math.round(
        env.uploads.maxBytes / 1000
      )} KB.`;
    } else {
      status = 400;
      code = ERROR_CODES.VALIDATION;
      message = "The upload could not be processed.";
    }
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = ERROR_CODES.VALIDATION;
    message = "The request body is not valid JSON.";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = ERROR_CODES.PAYLOAD_TOO_LARGE;
    message = "The request body is too large.";
  } else if (error.status === 404) {
    status = 404;
    code = ERROR_CODES.NOT_FOUND;
    message = "The requested resource was not found.";
  } else if (error.code === "ECONNREFUSED" || error.code === "57P01") {
    status = 503;
    code = ERROR_CODES.SERVICE_UNAVAILABLE;
    message = "The database is unavailable. Please try again shortly.";
  } else {
    const pg = fromPostgres(error);
    if (pg) ({ status, code, message } = pg);
  }

  if (status >= 500) {
    logger.error("Request failed", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      error: error.message,
      code: error.code,
      stack: env.isProduction ? undefined : error.stack,
    });

    if (env.isProduction) message = "Something went wrong. Please try again.";
  } else {
    logger.warn("Request rejected", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status,
      code,
      message,
    });
  }

  if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));

  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    requestId: req.id,
  });
};

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
    requestId: req.id,
  });
};

export default { errorHandler, notFound };
