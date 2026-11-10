import { asyncHandler, getRequestContext, sendCreated, sendMessage, sendOk } from "../utils/http.js";
import * as wards from "../services/ward.service.js";

export const list = asyncHandler(async (req, res) =>
  sendOk(res, await wards.list(req.user))
);

export const save = asyncHandler(async (req, res) => {
  const payload = { ...req.body, ...(req.params.id ? { id: req.params.id } : {}) };
  const result = await wards.save(req.user, payload, getRequestContext(req));

  if (req.method === "POST") return sendCreated(res, result);
  return sendOk(res, result);
});

export const remove = asyncHandler(async (req, res) =>
  sendMessage(res, (await wards.remove(req.user, req.params.id, getRequestContext(req))).message)
);
