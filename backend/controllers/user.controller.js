import { asyncHandler, getRequestContext, sendOk } from "../utils/http.js";
import * as users from "../services/user.service.js";
import { updateProfile } from "../services/auth.service.js";

export const list = asyncHandler(async (req, res) =>
  sendOk(res, await users.listUsers(req.user, req.filters))
);

export const updateMe = asyncHandler(async (req, res) =>
  sendOk(res, await updateProfile(req.user, req.body))
);

export const setStatus = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await users.setUserStatus(req.user, req.params.id, req.body, getRequestContext(req))
  )
);
