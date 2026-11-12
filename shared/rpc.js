import { ROLES } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { SERVICE_METHODS } from "./service.js";

/**
 * One authorisation gate for every data call.
 *
 * The browser and the Express endpoint both enter through here, so a method
 * can never be exposed with the wrong role check in one of the two places.
 */

const ADMIN_ONLY = new Set([
  "analytics",
  "listUsers",
  "setUserStatus",
  "listOfficers",
  "saveWard",
  "deleteWard",
  "saveRepresentative",
  "deleteRepresentative",
  "broadcastNotification",
  "saveSettings",
  "updateComplaintStatus",
  "updateComplaintWork",
  "assignComplaint",
  "listEmailOutbox",
  "listCitizenVerifications",
  "reviewCitizenVerification",
  "listVerificationAudit",
]);

const OFFICER_ONLY = new Set([
  "officerProfile",
  "officerDashboard",
  "listOfficerComplaints",
  "getOfficerComplaint",
  "updateOfficerStatus",
  "resolveOfficerComplaint",
  "updateOfficerWork",
]);

const SESSION_ONLY = new Set([
  "updateProfile",
  "submitAadhaar",
  "changePassword",
  "createComplaint",
  "upvoteComplaint",
  "addComment",
  "verifyComplaint",
  "acceptComplaint",
  "checkDuplicates",
  "myStats",
  "listNotifications",
  "markNotificationsRead",
]);

export async function dispatch(service, method, args = {}, token = null) {
  if (!SERVICE_METHODS.includes(method)) {
    throw new AppError(ERROR_CODES.VALIDATION, `Unknown action: ${method}`);
  }

  const needsActor =
    ADMIN_ONLY.has(method) || OFFICER_ONLY.has(method) || SESSION_ONLY.has(method);

  let actor = null;
  if (token) {
    try {
      actor = (await service.me({ token }, null)).user;
    } catch (error) {
      // A stale token must not block a fresh sign-in, but it must block
      // anything that needs an account.
      if (needsActor) throw error;
    }
  }

  if (needsActor && !actor) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
  }

  if (ADMIN_ONLY.has(method) && actor.role !== ROLES.ADMIN) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Only city administrators can perform this action.");
  }

  if (OFFICER_ONLY.has(method) && actor.role !== ROLES.OFFICER) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Sanitation officer access is required.");
  }

  // `me` receives its token explicitly; every other method receives the actor.
  // The API client sends the token beside the arguments, so accept either
  // placement instead of only the browser's { token } copy in `args`.
  if (method === "me") return service.me({ token: token ?? args.token }, null);

  return service[method](args, actor);
}
