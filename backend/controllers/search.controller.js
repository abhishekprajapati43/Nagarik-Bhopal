import { asyncHandler, sendOk } from "../utils/http.js";
import * as search from "../services/search.service.js";

export const searchAll = asyncHandler(async (req, res) =>
  sendOk(res, await search.search(req.user, req.filters))
);
