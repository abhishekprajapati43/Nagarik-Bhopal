import { asyncHandler, getRequestContext, sendOk } from "../utils/http.js";
import * as complaintService from "../services/complaint.service.js";
import * as officerService from "../services/officer.service.js";

export const dashboard = asyncHandler(async (req, res) =>
  sendOk(res, await complaintService.officerDashboard(req.user))
);

export const list = asyncHandler(async (req, res) =>
  sendOk(res, await complaintService.officerList(req.query, req.user))
);

export const get = asyncHandler(async (req, res) =>
  sendOk(res, await complaintService.officerGet(req.params.id, req.user))
);

export const updateStatus = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await complaintService.officerUpdateStatus(
      req.user,
      req.params.id,
      req.body,
      getRequestContext(req)
    )
  )
);

export const resolve = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await complaintService.officerUpdateStatus(
      req.user,
      req.params.id,
      { ...req.body, status: "Resolved" },
      getRequestContext(req)
    )
  )
);

export const updateWork = asyncHandler(async (req, res) =>
  sendOk(
    res,
    await complaintService.officerUpdateWork(
      req.user,
      req.params.id,
      req.body,
      getRequestContext(req)
    )
  )
);

export const profile = asyncHandler(async (req, res) =>
  sendOk(res, await officerService.profile(req.user))
);

export const directory = asyncHandler(async (req, res) =>
  sendOk(res, await officerService.list(req.user))
);
