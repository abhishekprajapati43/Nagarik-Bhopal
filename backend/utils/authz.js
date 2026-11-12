import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES, STAFF_ROLES } from "../../shared/constants.js";

export const isAdmin = (actor) => actor?.role === ROLES.ADMIN;
export const isOfficer = (actor) => actor?.role === ROLES.OFFICER;
export const isStaff = (actor) => STAFF_ROLES.includes(actor?.role);

export const requireAdmin = (actor) => {
  if (!isAdmin(actor)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Administrator access is required.");
  }
  return actor;
};

export const requireOfficer = (actor) => {
  if (!isOfficer(actor)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Sanitation officer access is required.");
  }
  return actor;
};

export const requireStaff = (actor) => {
  if (!isStaff(actor)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Staff access is required.");
  }
  return actor;
};

export default { isAdmin, isOfficer, isStaff, requireAdmin, requireOfficer, requireStaff };
