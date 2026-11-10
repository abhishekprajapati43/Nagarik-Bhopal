/**
 * A single error type for the whole app so the UI can show `error.message`
 * and the API can map `error.code` to an HTTP status.
 */
export class AppError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = {
  VALIDATION: "VALIDATION",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  BLOCKED: "BLOCKED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  STORAGE: "STORAGE",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA: "UNSUPPORTED_MEDIA",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL: "INTERNAL",
};

const STATUS_BY_CODE = {
  VALIDATION: 400,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  BLOCKED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STORAGE: 507,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export const httpStatusFor = (code) => STATUS_BY_CODE[code] || 500;

/** Normalise anything thrown by the service into a user facing message. */
export const messageFor = (error, fallback = "Something went wrong. Please try again.") => {
  if (error instanceof AppError) return error.message;
  if (error?.message && typeof error.message === "string") return error.message;
  return fallback;
};
