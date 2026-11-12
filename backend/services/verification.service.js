import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { AADHAAR_STATUS, AADHAAR_STATUS_LIST, ROLES } from "../../shared/constants.js";
import { oneOf, optionalText } from "../../shared/validation.js";
import * as users from "../repositories/user.repository.js";
import * as notifications from "../repositories/notification.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { citizenVerification, iso, publicUser } from "../utils/serialize.js";
import { requireAdmin } from "../utils/authz.js";
import { pageMeta, pagination } from "../utils/pagination.js";

/**
 * Admin Citizen Verification module.
 *
 * Every response uses the masked Aadhaar (`XXXX XXXX 1234`). The encrypted
 * number and lookup hash stay in the users table and are never selected into
 * an API response, including for administrators.
 */

const REVIEW_DECISIONS = [AADHAAR_STATUS.VERIFIED, AADHAAR_STATUS.REJECTED];

export const list = async (actor, query = {}) => {
  requireAdmin(actor);

  const { page, limit } = pagination(query, 20);
  const status = query.status
    ? oneOf(String(query.status), AADHAAR_STATUS_LIST, "verification status")
    : "";

  const { rows, total } = await users.listVerifications({
    status,
    search: String(query.search || "").trim().slice(0, 80),
    page,
    limit,
  });

  return {
    items: rows.map(citizenVerification),
    ...pageMeta(total, page, limit),
  };
};

export const review = async (actor, userId, payload = {}, context = {}) => {
  requireAdmin(actor);

  const decision = oneOf(
    String(payload.decision ?? payload.status ?? ""),
    REVIEW_DECISIONS,
    "verification decision"
  );
  const remarks = optionalText(payload.remarks, { field: "Remarks", max: 500 });

  if (decision === AADHAAR_STATUS.REJECTED && !remarks) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Add a remark explaining why the Aadhaar verification was rejected."
    );
  }

  const record = await users.findById(userId);

  if (!record || record.role !== ROLES.USER) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "That resident account could not be found.");
  }

  const approved = decision === AADHAAR_STATUS.VERIFIED;
  const updated = await users.reviewAadhaar(record.id, {
    status: decision,
    verified: approved,
    remarks,
    verifiedAt: approved ? new Date().toISOString() : null,
  });

  await notifications.create({
    userId: updated.id,
    title: approved ? "Aadhaar verification approved" : "Aadhaar verification rejected",
    body: approved
      ? "Your identity is verified. You can now submit complaints."
      : `Your Aadhaar verification was rejected.${remarks ? ` Reason: ${remarks}` : ""} You can update and resubmit it from your profile.`,
    type: approved ? "system" : "admin",
  });

  await audit.record({
    actorId: actor.id,
    action: approved ? "aadhaar.verified" : "aadhaar.rejected",
    entity: "user",
    entityId: updated.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      result: decision,
      remarks,
      citizenName: updated.name,
      last4: updated.aadhaar_last4 || "",
    },
  });

  return {
    user: publicUser(updated),
    message: approved
      ? `${updated.name}'s Aadhaar verification was approved.`
      : `${updated.name}'s Aadhaar verification was rejected.`,
  };
};

export const history = async (actor, userId) => {
  requireAdmin(actor);

  const record = await users.findById(userId);

  if (!record || record.role !== ROLES.USER) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "That resident account could not be found.");
  }

  const rows = await users.listAadhaarAudit(record.id);

  return {
    userId: record.id,
    items: rows.map((row) => ({
      id: Number(row.id),
      action: row.action,
      result:
        row.metadata?.result ||
        row.metadata?.status ||
        (row.action === "aadhaar.verified"
          ? AADHAAR_STATUS.VERIFIED
          : row.action === "aadhaar.rejected"
            ? AADHAAR_STATUS.REJECTED
            : AADHAAR_STATUS.PENDING),
      remarks: row.metadata?.remarks || "",
      last4: row.metadata?.last4 || record.aadhaar_last4 || "",
      by: row.actor_name || "System",
      at: iso(row.created_at),
    })),
  };
};

export default { list, review, history };
