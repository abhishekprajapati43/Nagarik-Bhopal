import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { EMAIL_TEMPLATES } from "../../shared/constants.js";
import { emailAddress, requiredText } from "../../shared/validation.js";
import * as settings from "../repositories/settings.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { requireAdmin } from "../utils/authz.js";

const boolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new AppError(ERROR_CODES.VALIDATION, `${field} must be true or false.`);
  }
  return value;
};

export const get = async () => ({ settings: await settings.get() });

/** Accept a full form submission or a partial patch of known keys. */
export const save = async (actor, payload = {}, context = {}) => {
  requireAdmin(actor);

  const current = await settings.get();
  const next = { ...current, ...payload };

  const slaDays = Number(next.slaDays);

  if (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > 30) {
    throw new AppError(ERROR_CODES.VALIDATION, "SLA days must be a whole number from 1 to 30.");
  }

  const emailTemplates = {};

  for (const key of Object.keys(EMAIL_TEMPLATES)) {
    const entry = next.emailTemplates?.[key];
    if (!entry) continue;

    emailTemplates[key] = {
      subject: String(entry.subject ?? "").trim().slice(0, 200),
      body: String(entry.body ?? "").trim().slice(0, 4000),
    };
  }

  const patch = {
    cityName: requiredText(next.cityName, { field: "City name", min: 2, max: 60 }),
    department: requiredText(next.department, { field: "Department", min: 2, max: 80 }),
    supportEmail: emailAddress(next.supportEmail),
    slaDays,
    autoAssignWard: boolean(next.autoAssignWard, "Auto-assign ward"),
    allowRegistration: boolean(next.allowRegistration, "Allow registration"),
    notifyOnNewComplaint: boolean(next.notifyOnNewComplaint, "Notify on new complaint"),
    emailNotifications: boolean(
      next.emailNotifications === undefined ? true : next.emailNotifications,
      "Email notifications"
    ),
    emailTemplates,
  };

  const updated = await settings.save(patch);

  await audit.record({
    actorId: actor.id,
    action: "admin.settings_updated",
    entity: "settings",
    entityId: "1",
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: patch,
  });

  return { settings: updated, message: "Settings saved." };
};
