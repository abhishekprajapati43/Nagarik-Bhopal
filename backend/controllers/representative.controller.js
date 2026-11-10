import { asyncHandler, getRequestContext, sendCreated, sendMessage, sendOk } from "../utils/http.js";
import * as representatives from "../services/representative.service.js";

export const list = asyncHandler(async (_req, res) =>
  sendOk(res, await representatives.list())
);

export const save = asyncHandler(async (req, res) => {
  const payload = { ...req.body, ...(req.params.id ? { id: req.params.id } : {}) };
  const result = await representatives.save(req.user, payload, getRequestContext(req));

  if (req.method === "POST") return sendCreated(res, result);
  return sendOk(res, result);
});

export const remove = asyncHandler(async (req, res) =>
  sendMessage(
    res,
    (await representatives.remove(req.user, req.params.id, getRequestContext(req))).message
  )
);
