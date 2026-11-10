import crypto from "node:crypto";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { signJwt, verifyJwt } from "../../shared/jwt.js";
import { hashPassword, verifyPassword } from "../../shared/password.js";
import {
  ROLES,
  TOKEN_TTL_SECONDS,
  USER_STATUS,
} from "../../shared/constants.js";
import {
  emailAddress,
  loginIdentifier,
  password as passwordRule,
  phoneDigits,
  phoneNumber,
  requiredText,
} from "../../shared/validation.js";
import { env } from "../config/env.js";
import * as users from "../repositories/user.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as notifications from "../repositories/notification.repository.js";
import * as resets from "../repositories/passwordReset.repository.js";
import * as settings from "../repositories/settings.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { publicUser } from "../utils/serialize.js";
import { withTransaction } from "../config/database.js";

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const tokenFor = async (user, overrides = {}) => {
  const ttl = TOKEN_TTL_SECONDS[user.role] || TOKEN_TTL_SECONDS[ROLES.USER];

  return signJwt(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      tv: user.token_version,
      ...overrides,
    },
    env.jwtSecret,
    ttl
  );
};

const requireWard = async (wardId) => {
  if (!wardId) return "";

  const ward = await wards.findRowById(wardId);
  if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
  return ward.id;
};

/** Verify a bearer token and re-check the account on every request. */
export const authenticateToken = async (token) => {
  const claims = await verifyJwt(token, env.jwtSecret);
  const user = await users.findById(claims.sub);

  if (!user) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your account no longer exists. Please sign in again.");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(ERROR_CODES.BLOCKED, "Your account has been blocked. Contact the city office.");
  }

  if (Number(claims.tv || 0) !== Number(user.token_version || 0)) {
    throw new AppError(
      ERROR_CODES.UNAUTHENTICATED,
      "Your session ended because the password changed. Please sign in again."
    );
  }

  return { user, claims };
};

export const register = async (payload = {}, context = {}) => {
  const config = await settings.get();

  if (!config.allowRegistration) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "New registrations are closed right now. Contact the city office for help."
    );
  }

  const name = requiredText(payload.name, { field: "Full name", min: 2, max: 60 });
  const email = emailAddress(payload.email);
  const rawPassword = passwordRule(payload.password);
  const phone = phoneNumber(payload.phone);
  const wardId = await requireWard(payload.wardId ? String(payload.wardId) : "");

  if (await users.findByEmail(email)) {
    throw new AppError(ERROR_CODES.EMAIL_TAKEN, "An account with that email already exists.");
  }

  if (phone && (await users.phoneTaken(phoneDigits(phone)))) {
    throw new AppError(ERROR_CODES.CONFLICT, "That mobile number is already registered.");
  }

  const passwordHash = await hashPassword(rawPassword);

  const user = await users.create({
    name,
    email,
    phone,
    wardId,
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    passwordHash,
  });

  await notifications.create({
    userId: user.id,
    title: "Welcome to Nagarik Bhopal",
    body: "Track your reports, upvote issues around you and follow the fix.",
    type: "system",
  });

  await audit.record({
    actorId: user.id,
    action: "auth.register",
    entity: "user",
    entityId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { token: await tokenFor(user), user: publicUser(user) };
};

export const login = async (payload = {}, { admin = false, context = {} } = {}) => {
  // The resident form sends `identifier`; the admin form sends `email`.
  const identifier = loginIdentifier(payload.identifier ?? payload.email ?? "");
  const password = String(payload.password ?? "");

  if (!password) {
    throw new AppError(ERROR_CODES.VALIDATION, "Password is required.");
  }

  const user =
    identifier.type === "email"
      ? await users.findByEmail(identifier.value)
      : await users.findByPhone(identifier.value);

  const matches = user ? await verifyPassword(password, user.password_hash) : false;

  if (!user || !matches) {
    await audit.record({
      action: "auth.login.failed",
      entity: "user",
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { identifierType: identifier.type, admin },
    });
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "Email/mobile or password is incorrect.");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(ERROR_CODES.BLOCKED, "This account is blocked. Contact the city office.");
  }

  if (admin && user.role !== ROLES.ADMIN) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "This account does not have administrator access."
    );
  }

  await users.touchLogin(user.id);

  await audit.record({
    actorId: user.id,
    action: admin ? "auth.admin_login" : "auth.login",
    entity: "user",
    entityId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { token: await tokenFor(user), user: publicUser(user) };
};

export const me = async (actor) => ({ user: publicUser(actor) });

export const updateProfile = async (actor, payload = {}) => {
  const name = requiredText(payload.name, { field: "Full name", min: 2, max: 60 });
  const phone = phoneNumber(payload.phone);
  const wardId = await requireWard(payload.wardId ? String(payload.wardId) : "");

  if (phone && (await users.phoneTaken(phoneDigits(phone), actor.id))) {
    throw new AppError(ERROR_CODES.CONFLICT, "That mobile number belongs to another account.");
  }

  const updated = await users.updateProfile(actor.id, { name, phone, wardId });

  return { user: publicUser(updated), message: "Profile updated." };
};

export const changePassword = async (actor, payload = {}, context = {}) => {
  const currentPassword = String(payload.currentPassword ?? "");
  const newPassword = passwordRule(payload.newPassword, { field: "New password" });

  if (!currentPassword) {
    throw new AppError(ERROR_CODES.VALIDATION, "Current password is required.");
  }

  const stored = await users.findById(actor.id);
  const matches = await verifyPassword(currentPassword, stored.password_hash);

  if (!matches) {
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "Your current password is incorrect.");
  }

  if (await verifyPassword(newPassword, stored.password_hash)) {
    throw new AppError(ERROR_CODES.CONFLICT, "Choose a password you have not used before.");
  }

  const passwordHash = await hashPassword(newPassword);
  await users.updatePassword(actor.id, passwordHash);

  await audit.record({
    actorId: actor.id,
    action: "auth.password_changed",
    entity: "user",
    entityId: actor.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { message: "Password updated. Other devices stay signed in until their session expires." };
};

export const forgotPassword = async (payload = {}, context = {}) => {
  const message =
    "If that account exists, a password reset link has been created. Contact care@nagarik.bhopal if you need help.";

  let identifier;
  try {
    identifier = loginIdentifier(payload.identifier);
  } catch {
    return { message };
  }

  const user =
    identifier.type === "email"
      ? await users.findByEmail(identifier.value)
      : await users.findByPhone(identifier.value);

  if (!user || user.status === USER_STATUS.BLOCKED) return { message };

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + env.resetTokenTtlMinutes * 60_000);

  await resets.deleteForUser(user.id);
  await resets.create({ userId: user.id, tokenHash: hashResetToken(token), expiresAt });
  await resets.pruneExpired();

  await audit.record({
    actorId: user.id,
    action: "auth.password_reset_requested",
    entity: "user",
    entityId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    message,
    ...(env.exposeResetToken
      ? { resetToken: token, expiresAt: expiresAt.toISOString(), note: "Returned only outside production." }
      : {}),
  };
};

export const resetPassword = async (payload = {}, context = {}) => {
  const token = String(payload.token ?? "").trim();
  const newPassword = passwordRule(payload.password, { field: "New password" });

  if (!token) {
    throw new AppError(ERROR_CODES.VALIDATION, "The reset token is required.");
  }

  const record = await resets.findValid(hashResetToken(token));

  if (!record) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "This reset link is invalid or has expired. Request a new one."
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await users.updatePassword(record.user_id, passwordHash, { revokeSessions: true });
    await resets.markUsed(record.id, client);
    await resets.deleteForUser(record.user_id, client);
    await notifications.create(
      {
        userId: record.user_id,
        title: "Password reset",
        body: "Your password was reset. If this was not you, contact the city office immediately.",
        type: "system",
      },
      client
    );
  });

  await audit.record({
    actorId: record.user_id,
    action: "auth.password_reset",
    entity: "user",
    entityId: record.user_id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { message: "Password reset. You can sign in with your new password." };
};

export default {
  authenticateToken,
  register,
  login,
  me,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};
