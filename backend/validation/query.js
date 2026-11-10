import { AppError, ERROR_CODES } from "../../shared/errors.js";
import {
  PRIORITY_LIST,
  STATUS_LIST,
  USER_STATUS,
  WASTE_TYPES,
} from "../../shared/constants.js";
import { oneOf } from "../../shared/validation.js";
import { pagination } from "../utils/pagination.js";

const text = (value, field, max = 120) => {
  const result = String(value ?? "").trim();
  if (result.length > max) {
    throw new AppError(ERROR_CODES.VALIDATION, `${field} must be ${max} characters or fewer.`);
  }
  return result;
};

const dateParam = (value, field, endOfDay = false) => {
  if (!value) return "";

  const input = String(value).trim();
  const candidate = input.length === 10
    ? `${input}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : input;

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(ERROR_CODES.VALIDATION, `${field} must be a valid date.`);
  }

  return date.toISOString();
};

export const complaintListQuery = (query = {}) => {
  const { page, limit } = pagination(query, 12);

  return {
    page,
    limit,
    scope: query.scope === "mine" ? "mine" : "all",
    status: query.status ? oneOf(String(query.status), STATUS_LIST, "status") : "",
    wasteType: query.wasteType
      ? oneOf(String(query.wasteType), WASTE_TYPES, "waste type")
      : "",
    priority: query.priority
      ? oneOf(String(query.priority), PRIORITY_LIST, "priority")
      : "",
    sort: ["newest", "oldest", "upvotes", "priority"].includes(String(query.sort))
      ? String(query.sort)
      : "newest",
    search: text(query.search, "Search"),
    wardId: text(query.wardId, "Ward", 80),
    userId: text(query.userId, "User", 80),
    representativeId: text(query.representativeId, "Representative", 80),
    from: dateParam(query.from, "From date"),
    to: dateParam(query.to, "To date", true),
  };
};

export const userListQuery = (query = {}) => {
  const { page, limit } = pagination(query, 20);

  return {
    page,
    limit,
    search: text(query.search, "Search"),
    status: query.status ? oneOf(String(query.status), Object.values(USER_STATUS), "status") : "",
  };
};

export const notificationListQuery = (query = {}) => {
  const { page, limit } = pagination(query, 50);
  return { page, limit };
};

export const searchQuery = (query = {}) => {
  const term = text(query.q, "Search", 120);
  const limit = Number.parseInt(query.limit, 10);

  return {
    q: term,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 5,
  };
};
