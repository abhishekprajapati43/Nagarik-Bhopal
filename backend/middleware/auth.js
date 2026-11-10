import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES } from "../../shared/constants.js";
import { authenticateToken } from "../services/auth.service.js";
import { asyncHandler } from "../utils/http.js";

const readToken = (req) => {
  const header = req.get("authorization") || "";

  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  const alternate = req.get("x-auth-token");
  if (alternate) return alternate.trim();

  if (req.body && typeof req.body.token === "string") return req.body.token.trim();

  return "";
};

/** Reject unauthenticated requests. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);

  if (!token) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
  }

  const { user, claims } = await authenticateToken(token);

  req.auth = { token, claims };
  req.user = user;
  next();
});

/** Attach the actor when a token is present, but allow anonymous requests. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);

  if (token) {
    try {
      const { user, claims } = await authenticateToken(token);
      req.auth = { token, claims };
      req.user = user;
    } catch {
      // Public endpoints ignore a stale token rather than failing the request.
    }
  }

  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue."));
  }

  if (!roles.includes(req.user.role)) {
    return next(
      new AppError(ERROR_CODES.FORBIDDEN, "You do not have permission to do that.")
    );
  }

  return next();
};

export const requireAdmin = requireRole(ROLES.ADMIN);
