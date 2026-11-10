import { asyncHandler, getRequestContext, sendOk } from "../utils/http.js";
import * as settings from "../services/settings.service.js";

export const get = asyncHandler(async (_req, res) => sendOk(res, await settings.get()));

export const save = asyncHandler(async (req, res) =>
  sendOk(res, await settings.save(req.user, req.body, getRequestContext(req)))
);
