import { asyncHandler, getRequestContext, sendCreated, sendOk } from "../utils/http.js";
import * as complaints from "../services/complaint.service.js";

export const list = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.list(req.filters, req.user))
);

export const get = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.get(req.params.id, req.user))
);

export const create = asyncHandler(async (req, res) =>
  sendCreated(res, await complaints.create(req.user, req.body, getRequestContext(req)))
);

export const upvote = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.upvote(req.params.id, req.user))
);

export const addComment = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.addComment(req.params.id, req.user, req.body))
);

export const updateStatus = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await complaints.updateStatus(req.user, req.params.id, req.body, getRequestContext(req))
  )
);

export const assign = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await complaints.assign(req.user, req.params.id, req.body, getRequestContext(req))
  )
);
