import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { ROLES } from "../../shared/constants.js";

export const isAdmin = (actor) => actor?.role === ROLES.ADMIN;

export const requireAdmin = (actor) => {
  if (!isAdmin(actor)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Administrator access is required.");
  }
  return actor;
};

export default { isAdmin, requireAdmin };
