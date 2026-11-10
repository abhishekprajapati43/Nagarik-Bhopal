import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { requiredText } from "../../shared/validation.js";
import * as notifications from "../repositories/notification.repository.js";
import * as users from "../repositories/user.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { requireAdmin } from "../utils/authz.js";
import { pageMeta, pagination } from "../utils/pagination.js";
import { notification as serializeNotification } from "../utils/serialize.js";

export const list = async (actor, query = {}) => {
  const { page, limit } = pagination(query, 50);

  const [{ rows, total }, unread] = await Promise.all([
    notifications.listForUser(actor.id, { page, limit }),
    notifications.unreadCount(actor.id),
  ]);

  return {
    items: rows.map(serializeNotification),
    unread,
    ...pageMeta(total, page, limit),
  };
};

export const markRead = async (actor, id = "") => {
  const changed = await notifications.markRead(actor.id, id);

  return {
    message: id
      ? changed
        ? "Notification marked as read."
        : "That notification was already read."
      : "All notifications marked as read.",
    updated: changed,
  };
};

export const broadcast = async (actor, payload = {}, context = {}) => {
  requireAdmin(actor);

  const title = requiredText(payload.title, { field: "Title", min: 2, max: 120 });
  const body = requiredText(payload.body, { field: "Message", min: 2, max: 500 });

  let wardId = "";
  if (payload.wardId) {
    const ward = await wards.findRowById(String(payload.wardId));
    if (!ward) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        "Choose a valid ward, or leave the audience as everyone."
      );
    }
    wardId = ward.id;
  }

  const audience = await users.listAudienceIds({ wardId: wardId || "" });

  const recipients = await notifications.createForUsers(audience, {
    title,
    body,
    type: "broadcast",
  });

  // Keep a copy in the sender's inbox so the admin "recent notifications"
  // panel can show what was announced.
  await notifications.create({
    userId: actor.id,
    title,
    body,
    type: "broadcast",
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.notification_broadcast",
    entity: "notification",
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { recipients, wardId },
  });

  return {
    message:
      recipients === 0
        ? "There are no active residents in that audience."
        : `Notification sent to ${recipients} resident${recipients === 1 ? "" : "s"}.`,
    recipients,
  };
};
