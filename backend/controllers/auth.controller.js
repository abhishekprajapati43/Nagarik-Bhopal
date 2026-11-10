import { asyncHandler, getRequestContext, sendCreated, sendOk } from "../utils/http.js";
import * as auth from "../services/auth.service.js";

export const register = asyncHandler(async (req, res) =>
  sendCreated(res, await auth.register(req.body, getRequestContext(req)))
);

export const login = asyncHandler(async (req, res) =>
  sendOk(res, await auth.login(req.body, { context: getRequestContext(req) }))
);

export const adminLogin = asyncHandler(async (req, res) =>
  sendOk(res, await auth.login(req.body, { admin: true, context: getRequestContext(req) }))
);

export const me = asyncHandler(async (req, res) => sendOk(res, await auth.me(req.user)));

export const updateProfile = asyncHandler(async (req, res) =>
  sendOk(res, await auth.updateProfile(req.user, req.body))
);

export const changePassword = asyncHandler(async (req, res) =>
  sendOk(res, await auth.changePassword(req.user, req.body, getRequestContext(req)))
);

export const forgotPassword = asyncHandler(async (req, res) =>
  sendOk(res, await auth.forgotPassword(req.body, getRequestContext(req)))
);

export const resetPassword = asyncHandler(async (req, res) =>
  sendOk(res, await auth.resetPassword(req.body, getRequestContext(req)))
);
