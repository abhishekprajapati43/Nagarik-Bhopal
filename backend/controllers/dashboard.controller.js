import { asyncHandler, sendOk } from "../utils/http.js";
import * as complaints from "../services/complaint.service.js";

export const me = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.myStats(req.user))
);

export const admin = asyncHandler(async (req, res) =>
  sendOk(res, await complaints.analytics(req.user))
);
