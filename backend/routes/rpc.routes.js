import { Router } from "express";
import {
  AppError,
  ERROR_CODES,
  httpStatusFor,
  messageFor,
} from "../../shared/errors.js";
import { optionalAuth } from "../middleware/auth.js";
import { dispatch } from "../services/rpc.service.js";
import { getRequestContext } from "../utils/http.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * Legacy single-endpoint API used by the bundled frontend. Kept as a thin
 * compatibility layer over the same services the REST routes call.
 */
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { method, args } = req.body || {};

    if (!method || typeof method !== "string") {
      throw new AppError(ERROR_CODES.VALIDATION, "A method name is required.");
    }

    const result = await dispatch({
      method,
      args: args && typeof args === "object" ? args : {},
      actor: req.user || null,
      context: getRequestContext(req),
    });

    return res.json({ ok: true, result });
  } catch (error) {
    const code = error instanceof AppError ? error.code : ERROR_CODES.INTERNAL;
    const status = httpStatusFor(code);

    if (status >= 500) {
      logger.error("RPC call failed", {
        requestId: req.id,
        method: req.body?.method,
        error: error.message,
        stack: error.stack,
      });
    }

    return res.status(status).json({
      ok: false,
      error: { code, message: messageFor(error) },
    });
  }
});

export default router;
