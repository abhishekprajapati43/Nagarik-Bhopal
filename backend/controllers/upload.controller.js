import { asyncHandler, getRequestContext, sendCreated, sendMessage } from "../utils/http.js";
import * as uploads from "../services/upload.service.js";

export const store = asyncHandler(async (req, res) =>
  sendCreated(res, await uploads.store(req.user, req.file, getRequestContext(req)))
);

export const remove = asyncHandler(async (req, res) => {
  const result = await uploads.remove(req.user, req.params.id, getRequestContext(req));
  return sendMessage(res, result.message);
});
