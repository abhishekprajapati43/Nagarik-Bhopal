import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { requireAdmin, requireOfficer } from "../utils/authz.js";
import { complaintListQuery } from "../validation/query.js";
import * as auth from "./auth.service.js";
import * as users from "./user.service.js";
import * as complaints from "./complaint.service.js";
import * as officers from "./officer.service.js";
import * as wards from "./ward.service.js";
import * as representatives from "./representative.service.js";
import * as notifications from "./notification.service.js";
import * as settings from "./settings.service.js";
import * as email from "./email.service.js";
import * as verification from "./verification.service.js";

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
  officerLogin: {
    auth: false,
    handler: ({ args, context }) => auth.login(args, { officer: true, context }),
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
  submitAadhaar: {
    auth: true,
    handler: ({ args, actor, context }) => auth.submitAadhaar(actor, args, context),
  },
  changePassword: {
    auth: true,
    handler: ({ args, actor, context }) => auth.changePassword(actor, args, context),
  },

  /* ----------------------------- complaints --------------------------- */
  listComplaints: {
    auth: true,
    handler: ({ args, actor }) => complaints.list(complaintListQuery(args), actor),
  },
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
  verifyComplaint: {
    auth: true,
    handler: ({ args, actor, context }) =>
      complaints.verify(args.id, actor, args, context),
  },
  checkDuplicates: {
    auth: true,
    handler: ({ args, actor }) => complaints.checkDuplicates(args, actor),
  },
  acceptComplaint: {
    auth: true,
    handler: ({ args, actor, context }) =>
      complaints.accept(actor, args.id, args, context),
  },

  /* ----------------------------- officer ------------------------------ */
  officerDashboard: {
    officer: true,
    handler: ({ actor }) => complaints.officerDashboard(actor),
  },
  listOfficerComplaints: {
    officer: true,
    handler: ({ args, actor }) => complaints.officerList(args, actor),
  },
  getOfficerComplaint: {
    officer: true,
    handler: ({ args, actor }) => complaints.officerGet(args.id, actor),
  },
  updateOfficerStatus: {
    officer: true,
    handler: ({ args, actor, context }) =>
      complaints.officerUpdateStatus(actor, args.id, args, context),
  },
  resolveOfficerComplaint: {
    officer: true,
    handler: ({ args, actor, context }) =>
      complaints.officerUpdateStatus(actor, args.id, { ...args, status: "Resolved" }, context),
  },
  updateOfficerWork: {
    officer: true,
    handler: ({ args, actor, context }) =>
      complaints.officerUpdateWork(actor, args.id, args, context),
  },
  officerProfile: {
    officer: true,
    handler: ({ actor }) => officers.profile(actor),
  },

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
  updateComplaintWork: {
    admin: true,
    handler: ({ args, actor, context }) =>
      complaints.adminUpdateWork(actor, args.id, args, context),
  },
  listOfficers: {
    admin: true,
    handler: ({ actor }) => officers.list(actor),
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
  getWard: {
    auth: false,
    handler: ({ args, actor }) => wards.get(actor, args.id),
  },
  assignWard: {
    admin: true,
    handler: ({ args, actor, context }) => wards.assign(actor, args.id, args, context),
  },
  wardHeatmap: {
    auth: false,
    handler: () => wards.heatmap(),
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
  listEmailOutbox: {
    admin: true,
    handler: ({ args }) => email.list(args.limit),
  },
  listCitizenVerifications: {
    admin: true,
    handler: ({ args, actor }) => verification.list(actor, args),
  },
  reviewCitizenVerification: {
    admin: true,
    handler: ({ args, actor, context }) =>
      verification.review(actor, args.userId, args, context),
  },
  listVerificationAudit: {
    admin: true,
    handler: ({ args, actor }) => verification.history(actor, args.userId),
  },

  /* -------------------------- shared reads ---------------------------- */
  listWards: { auth: false, handler: ({ args, actor }) => wards.list(actor, args) },
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

  if ((entry.auth || entry.admin || entry.officer) && !actor) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
  }

  if (entry.admin) requireAdmin(actor);
  if (entry.officer) requireOfficer(actor);

  return entry.handler({ args: args || {}, actor, context });
};

export const methodNames = () => Object.keys(METHODS);

export default { dispatch, methodNames };
