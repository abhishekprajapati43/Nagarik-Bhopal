import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES, USER_STATUS } from "../../shared/constants.js";
import { oneOf } from "../../shared/validation.js";
import * as users from "../repositories/user.repository.js";
import * as notifications from "../repositories/notification.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { pageMeta, pagination } from "../utils/pagination.js";
import { publicUser, userWithStats } from "../utils/serialize.js";
import { requireAdmin } from "../utils/authz.js";

export const listUsers = async (actor, query = {}) => {
  requireAdmin(actor);
  const { page, limit } = pagination(query, 20);

  const { rows, total } = await users.list({
    search: String(query.search || "").trim(),
    status: query.status === USER_STATUS.BLOCKED ? USER_STATUS.BLOCKED : query.status === USER_STATUS.ACTIVE ? USER_STATUS.ACTIVE : "",
    page,
    limit,
  });

  return {
    items: rows.map(userWithStats),
    ...pageMeta(total, page, limit),
  };
};

export const setUserStatus = async (actor, userId, payload = {}, context = {}) => {
  const status = oneOf(payload.status, Object.values(USER_STATUS), "status");

  if (userId === actor.id) {
    throw new AppError(ERROR_CODES.CONFLICT, "You cannot block your own admin account.");
  }

  const record = await users.findById(userId);

  if (!record) throw new AppError(ERROR_CODES.NOT_FOUND, "That user could not be found.");
  if (record.role === ROLES.ADMIN) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Administrator accounts cannot be blocked here.");
  }

  const updated = await users.setStatus(record.id, status);

  await notifications.create({
    userId: updated.id,
    title: status === USER_STATUS.BLOCKED ? "Account blocked" : "Account re-activated",
    body:
      status === USER_STATUS.BLOCKED
        ? "Your account was blocked by the city office. Contact support for details."
        : "Your account is active again. You can report issues.",
    type: "admin",
  });

  await audit.record({
    actorId: actor.id,
    action: status === USER_STATUS.BLOCKED ? "admin.user_blocked" : "admin.user_activated",
    entity: "user",
    entityId: updated.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { user: publicUser(updated), message: `Account ${status}.` };
};
