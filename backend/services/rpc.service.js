import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { requireAdmin } from "../utils/authz.js";
import * as auth from "./auth.service.js";
import * as users from "./user.service.js";
import * as complaints from "./complaint.service.js";
import * as wards from "./ward.service.js";
import * as representatives from "./representative.service.js";
import * as notifications from "./notification.service.js";
import * as settings from "./settings.service.js";

/**
 * Compatibility bridge for the single RPC endpoint the existing frontend
 * calls. Every method delegates to the same PostgreSQL services used by the
 * REST routes, so both entry points stay consistent.
 */
const METHODS = {
  /* ------------------------------- auth ------------------------------- */
  register: { auth: false, handler: ({ args, context }) => auth.register(args, context) },
  login: { auth: false, handler: ({ args, context }) => auth.login(args, { context }) },
  adminLogin: {
    auth: false,
    handler: ({ args, context }) => auth.login(args, { admin: true, context }),
  },
  forgotPassword: {
    auth: false,
    handler: ({ args, context }) => auth.forgotPassword(args, context),
  },
  resetPassword: {
    auth: false,
    handler: ({ args, context }) => auth.resetPassword(args, context),
  },
  me: { auth: true, handler: ({ actor }) => auth.me(actor) },
  updateProfile: { auth: true, handler: ({ args, actor }) => auth.updateProfile(actor, args) },
  changePassword: {
    auth: true,
    handler: ({ args, actor, context }) => auth.changePassword(actor, args, context),
  },

  /* ----------------------------- complaints --------------------------- */
  listComplaints: { auth: true, handler: ({ args, actor }) => complaints.list(args, actor) },
  getComplaint: { auth: true, handler: ({ args, actor }) => complaints.get(args.id, actor) },
  createComplaint: {
    auth: true,
    handler: ({ args, actor, context }) => complaints.create(actor, args, context),
  },
  upvoteComplaint: { auth: true, handler: ({ args, actor }) => complaints.upvote(args.id, actor) },
  addComment: {
    auth: true,
    handler: ({ args, actor }) => complaints.addComment(args.id, actor, args),
  },
  myStats: { auth: true, handler: ({ actor }) => complaints.myStats(actor) },

  /* ------------------------------ admin ------------------------------- */
  analytics: {
    admin: true,
    handler: ({ actor }) => complaints.analytics(actor),
  },
  updateComplaintStatus: {
    admin: true,
    handler: ({ args, actor, context }) =>
      complaints.updateStatus(actor, args.id, args, context),
  },
  assignComplaint: {
    admin: true,
    handler: ({ args, actor, context }) => complaints.assign(actor, args.id, args, context),
  },
  // The admin console has no pager, so the RPC bridge returns the whole list.
  listUsers: {
    admin: true,
    handler: ({ args, actor }) => users.listUsers(actor, { limit: 200, ...args }),
  },
  setUserStatus: {
    admin: true,
    handler: ({ args, actor, context }) =>
      users.setUserStatus(actor, args.userId, args, context),
  },
  saveWard: {
    admin: true,
    handler: ({ args, actor, context }) => wards.save(actor, args, context),
  },
  deleteWard: {
    admin: true,
    handler: ({ args, actor, context }) => wards.remove(actor, args.id, context),
  },
  saveRepresentative: {
    admin: true,
    handler: ({ args, actor, context }) => representatives.save(actor, args, context),
  },
  deleteRepresentative: {
    admin: true,
    handler: ({ args, actor, context }) => representatives.remove(actor, args.id, context),
  },
  broadcastNotification: {
    admin: true,
    handler: ({ args, actor, context }) => notifications.broadcast(actor, args, context),
  },
  saveSettings: {
    admin: true,
    handler: ({ args, actor, context }) => settings.save(actor, args, context),
  },

  /* -------------------------- shared reads ---------------------------- */
  listWards: { auth: false, handler: ({ actor }) => wards.list(actor) },
  listRepresentatives: { auth: false, handler: () => representatives.list() },
  getSettings: { auth: false, handler: () => settings.get() },
  listNotifications: {
    auth: true,
    handler: ({ args, actor }) => notifications.list(actor, { limit: 200, ...args }),
  },
  markNotificationsRead: {
    auth: true,
    handler: ({ args, actor }) => notifications.markRead(actor, args.id || ""),
  },
};

export const dispatch = async ({ method, args = {}, actor = null, context = {} }) => {
  const entry = METHODS[method];

  if (!entry) {
    throw new AppError(ERROR_CODES.NOT_FOUND, `Unknown API method: ${method}`);
  }

  if ((entry.auth || entry.admin) && !actor) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
  }

  if (entry.admin) requireAdmin(actor);

  return entry.handler({ args: args || {}, actor, context });
};

export const methodNames = () => Object.keys(METHODS);

export default { dispatch, methodNames };
