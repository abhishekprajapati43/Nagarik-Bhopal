import { AppError, ERROR_CODES } from "../../shared/errors.js";
import * as complaints from "../repositories/complaint.repository.js";
import * as users from "../repositories/user.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as representatives from "../repositories/representative.repository.js";
import { isAdmin } from "../utils/authz.js";
import {
  complaint as serializeComplaint,
  representative as serializeRepresentative,
  userWithStats,
  ward as serializeWard,
} from "../utils/serialize.js";

export const search = async (actor, query = {}) => {
  const term = String(query.q || "").trim();

  if (term.length < 2) {
    throw new AppError(ERROR_CODES.VALIDATION, "Enter at least 2 characters to search.");
  }

  const limit = Math.min(20, Math.max(1, Number.parseInt(query.limit, 10) || 5));
  const termLower = term.toLowerCase();

  const [complaintResult, wardRows, representativeRows] = await Promise.all([
    complaints.list({
      actorId: actor.id,
      search: term,
      page: 1,
      limit,
      sort: "newest",
    }),
    wards.list(),
    representatives.list(),
  ]);

  let userItems = [];

  if (isAdmin(actor)) {
    const userResult = await users.list({ search: term, page: 1, limit });
    userItems = userResult.rows.map(userWithStats);
  }

  return {
    query: term,
    complaints: complaintResult.rows.map(serializeComplaint),
    users: userItems,
    wards: wardRows
      .filter((row) =>
        `${row.name} ${row.area} ${row.zone}`.toLowerCase().includes(termLower)
      )
      .slice(0, limit)
      .map(serializeWard),
    representatives: representativeRows
      .filter((row) =>
        `${row.name} ${row.designation} ${row.ward_name || ""}`
          .toLowerCase()
          .includes(termLower)
      )
      .slice(0, limit)
      .map(serializeRepresentative),
  };
};
