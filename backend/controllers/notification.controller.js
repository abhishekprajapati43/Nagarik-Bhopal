import { asyncHandler, getRequestContext, sendOk, sendMessage } from "../utils/http.js";
import * as notifications from "../services/notification.service.js";

export const list = asyncHandler(async (req, res) =>
  sendOk(res, await notifications.list(req.user, req.filters))
);

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await notifications.markRead(req.user, "");
  return sendMessage(res, result.message, { updated: result.updated });
});

export const markOneRead = asyncHandler(async (req, res) => {
  const result = await notifications.markRead(req.user, req.params.id);
  return sendMessage(res, result.message, { updated: result.updated });
});

export const broadcast = asyncHandler(async (req, res) => {
  const result = await notifications.broadcast(
    req.user,
    req.body,
    getRequestContext(req)
  );
  return sendMessage(res, result.message, { recipients: result.recipients });
});
