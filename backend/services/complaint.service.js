import { AppError, ERROR_CODES } from "../../shared/errors.js";
import {
  ACTIVE_WORK_STATUSES,
  COMPLAINT_CATEGORIES,
  GARBAGE_CATEGORY_ID,
  PENDING_STATUSES,
  RESOLVED_STATUSES,
  ROLES,
  STATUS,
  STATUS_LIST,
  VERIFICATION_STATUS,
  WASTE_TYPES,
  complaintCategoryLabel,
  findCategoryForIssue,
  findComplaintCategory,
} from "../../shared/constants.js";
import {
  commentText,
  complaintPayload,
  photoValue,
  statusValue,
  verificationDecision,
  workNotes as workNotesRule,
} from "../../shared/validation.js";
import * as complaints from "../repositories/complaint.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as representatives from "../repositories/representative.repository.js";
import * as officers from "../repositories/officer.repository.js";
import * as users from "../repositories/user.repository.js";
import * as notifications from "../repositories/notification.repository.js";
import * as settings from "../repositories/settings.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { pageMeta, pagination } from "../utils/pagination.js";
import { isOfficer, requireAdmin, requireOfficer } from "../utils/authz.js";
import { logger } from "../utils/logger.js";
import * as email from "./email.service.js";
import * as ai from "./ai.service.js";
import {
  complaint as serializeComplaint,
  complaintComment,
  statusHistoryEntry,
  timelineEntry,
  verificationHistoryEntry,
} from "../utils/serialize.js";

const round = (value) => Math.round(Number(value || 0) * 10) / 10;

const withTimeline = (row, timelineRows = []) => ({
  ...serializeComplaint(row),
  timeline: timelineRows.map(timelineEntry),
});

const attachTimelines = async (rows) => {
  if (!rows.length) return [];

  const timelineRows = await complaints.listTimelineForMany(rows.map((row) => row.id));
  const grouped = new Map();

  for (const entry of timelineRows) {
    if (!grouped.has(entry.complaint_id)) grouped.set(entry.complaint_id, []);
    grouped.get(entry.complaint_id).push(entry);
  }

  return rows.map((row) => withTimeline(row, grouped.get(row.id) || []));
};

const requireComplaintRow = async (id) => {
  const row = await complaints.findRowById(id);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, "That complaint could not be found.");
  return row;
};

const officerForActor = async (actor) => {
  requireOfficer(actor);
  const record = await officers.findByUserId(actor.id);
  if (!record || !record.is_active) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Your officer profile is not active. Contact the city administrator."
    );
  }
  // Read the joined row so the officer's name is available for notifications.
  const officer = await officers.findById(record.id);
  return officer || record;
};

const requireAssigned = (row, officer) => {
  if (row.assigned_officer_id !== officer.id) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "This complaint is not assigned to you."
    );
  }
};

const complaintCode = (id) => `#${String(id).slice(-6).toUpperCase()}`;

const recordStatus = async (
  row,
  { status, note, actor, role = actor?.role || "system" },
  db = null
) => {
  await complaints.addTimelineEntry(
    row.id,
    { status, note, by: actor?.name || "System" },
    db
  );
  await complaints.recordStatusHistory(
    {
      complaintId: row.id,
      fromStatus: row.status,
      toStatus: status,
      note,
      actorId: actor?.id || null,
      actorName: actor?.name || "System",
      actorRole: role,
    },
    db
  );
};

const notifyAdmins = async (payload) =>
  notifications.createForUsers(await users.listAdminIds(), payload);

const notifyOfficer = async (officerId, payload, db = null) => {
  if (!officerId) return;
  const officer = await officers.findById(officerId);
  if (!officer) return;
  await notifications.create({ ...payload, userId: officer.user_id }, db);
};

/**
 * Compose the placeholders used by the configurable email templates. The row
 * may be a `SELECT *` complaint or a joined view, so both shapes are handled.
 */
const emailVars = async (row, extra = {}) => {
  const config = await settings.get();
  let citizen = null;

  if (!row.user_email || !row.user_name) {
    citizen = await users.findById(row.user_id).catch(() => null);
  }

  return {
    code: complaintCode(row.id),
    citizenName: row.user_name || citizen?.name || "Resident",
    address: row.address || "",
    issue: row.complaint_type || row.waste_type || "civic issue",
    category: row.complaint_category || GARBAGE_CATEGORY_ID,
    status: row.status || "",
    ward: row.ward_name || "",
    officerName: extra.officerName || row.officer_name || "",
    city: config.cityName || "Bhopal",
    department: config.department || "Bhopal Municipal Corporation",
    ...extra,
  };
};

/** Queue an automatic email and never let a mail failure break the workflow. */
const sendComplaintEmail = async (row, templateKey, extra = {}) => {
  try {
    const vars = await emailVars(row, extra);
    let to = row.user_email;

    if (!to) {
      const citizen = await users.findById(row.user_id);
      to = citizen?.email || "";
    }

    await email.queueEmail({ to, templateKey, vars, complaintId: row.id });
  } catch (error) {
    logger.warn("Complaint email skipped", { templateKey, error: error.message });
  }
};

const EMAIL_BY_STATUS = {
  [STATUS.ACCEPTED]: "complaintAccepted",
  [STATUS.ASSIGNED]: "officerAssigned",
  [STATUS.IN_PROGRESS]: "workStarted",
  [STATUS.RESOLVED]: "complaintResolved",
  [STATUS.CITIZEN_VERIFICATION]: "complaintResolved",
  [STATUS.CLOSED]: "complaintClosed",
  [STATUS.REOPENED]: "complaintReopened",
};

/**
 * Complete a complaint and open the citizen-verification step. The resolved
 * state is recorded first, then the complaint waits in Citizen Verification
 * until the reporter answers the question.
 */
const requestVerification = async (row, actor, payload = {}, context = {}) => {
  const note = String(payload.note || "").trim();
  const beforePhoto = photoValue(payload.beforePhoto, "Before cleaning photo");
  const afterPhoto = photoValue(payload.afterPhoto, "After cleaning photo");
  const notes = workNotesRule(payload.workNotes);
  const now = new Date().toISOString();

  await complaints.updateWorkflow(row.id, {
    status: STATUS.CITIZEN_VERIFICATION,
    verificationStatus: VERIFICATION_STATUS.PENDING,
    resolved_at: now,
    verified_at: null,
    closed_at: null,
    ...(payload.beforePhoto !== undefined ? { beforePhoto } : {}),
    ...(payload.afterPhoto !== undefined ? { afterPhoto } : {}),
    ...(payload.workNotes !== undefined ? { workNotes: notes } : {}),
  });

  const resolvedNote =
    note || "Cleaning completed by the sanitation team. Awaiting citizen verification.";
  await recordStatus(row, { status: STATUS.RESOLVED, note: resolvedNote, actor });

  await complaints.addTimelineEntry(row.id, {
    status: STATUS.CITIZEN_VERIFICATION,
    note: "Citizen asked: Has your issue been resolved?",
    by: "System",
  });
  await complaints.recordStatusHistory({
    complaintId: row.id,
    fromStatus: STATUS.RESOLVED,
    toStatus: STATUS.CITIZEN_VERIFICATION,
    note: "Citizen verification requested.",
    actorId: null,
    actorName: "System",
    actorRole: "system",
  });

  await complaints.recordVerification({
    complaintId: row.id,
    decision: "requested",
    note: "Citizen verification requested.",
    actorId: null,
    actorName: "System",
    actorRole: "system",
  });

  await notifications.create({
    userId: row.user_id,
    title: `Complaint ${complaintCode(row.id)} marked resolved`,
    body: "Has your issue been resolved? Open the complaint and confirm Yes or No.",
    type: "status",
    complaintId: row.id,
  });

  await sendComplaintEmail(row, "complaintResolved", {
    officerName: actor?.name || row.officer_name || "",
  });

  await audit.record({
    actorId: actor.id,
    action: "officer.complaint_resolved",
    entity: "complaint",
    entityId: row.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { beforePhoto: Boolean(beforePhoto), afterPhoto: Boolean(afterPhoto) },
  });
};

const applyStatus = async (row, actor, status, note, context = {}) => {
  const now = new Date().toISOString();
  const changes = { status };

  if (status === STATUS.CLOSED) {
    changes.verificationStatus = VERIFICATION_STATUS.VERIFIED;
    changes.verified_at = now;
    changes.closed_at = now;
  } else if (status === STATUS.REOPENED) {
    changes.verificationStatus = VERIFICATION_STATUS.REOPENED;
    changes.reopened_at = now;
  } else if (status === STATUS.IN_PROGRESS) {
    changes.reopened_at = null;
  }

  await complaints.updateWorkflow(row.id, changes);
  await recordStatus(row, { status, note, actor });

  await audit.record({
    actorId: actor.id,
    action: "complaint.status_changed",
    entity: "complaint",
    entityId: row.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { from: row.status, to: status },
  });
};

const nearestWardId = (wardRows, position) => {
  if (!Array.isArray(position) || position.length !== 2) return "";

  const [latitude, longitude] = position.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";

  let closest = null;
  let best = Number.POSITIVE_INFINITY;

  for (const ward of wardRows) {
    const distance =
      (Number(ward.center_lat) - latitude) ** 2 + (Number(ward.center_lng) - longitude) ** 2;
    if (distance < best) {
      best = distance;
      closest = ward;
    }
  }

  return closest?.id || "";
};

export const list = async (query = {}, actor) => {
  const { page, limit } = pagination(query, 12);
  const officer = isOfficer(actor) ? await officerForActor(actor) : null;

  const { rows, total, statusCounts: counts } = await complaints.list({
    actorId: actor?.id || "",
    userId: query.scope === "mine" ? actor.id : query.userId || "",
    assignedOfficerId: officer ? officer.id : query.assignedOfficerId || "",
    unassignedOfficer: query.unassignedOfficer === "true",
    verificationStatus: query.verificationStatus || "",
    status: query.status || "",
    complaintCategory: query.complaintCategory || "",
    complaintType: query.complaintType || "",
    wasteType: query.wasteType || "",
    wardId: query.wardId || "",
    priority: query.priority || "",
    representativeId: query.representativeId || "",
    search: String(query.search || "").trim(),
    from: query.from || "",
    to: query.to || "",
    sort: query.sort || "newest",
    page,
    limit,
  });

  const statusCounts = Object.fromEntries(STATUS_LIST.map((status) => [status, 0]));
  Object.assign(statusCounts, counts);

  return {
    items: await attachTimelines(rows),
    statusCounts,
    ...pageMeta(total, page, limit),
  };
};

export const get = async (id, actor) => {
  const row = await complaints.findView(id, actor?.id || "");
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, "That complaint could not be found.");

  if (isOfficer(actor)) {
    const officer = await officerForActor(actor);
    if (row.assigned_officer_id !== officer.id) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "This complaint is not assigned to you.");
    }
  }

  const [commentRows, timelineRows, historyRows, assignmentRows, verificationRows] =
    await Promise.all([
      complaints.listComments(id),
      complaints.listTimeline(id),
      complaints.listStatusHistory(id),
      complaints.listAssignments(id),
      complaints.listVerificationHistory(id),
    ]);

  return {
    complaint: {
      ...withTimeline(row, timelineRows),
      comments: commentRows.map(complaintComment),
      statusHistory: historyRows.map(statusHistoryEntry),
      verificationHistory: verificationRows.map(verificationHistoryEntry),
      assignments: assignmentRows.map((entry) => ({
        id: Number(entry.id),
        officerId: entry.officer_id,
        officerName: entry.officer_name,
        assignedBy: entry.assigned_by_name || "System",
        note: entry.note,
        assignedAt: entry.assigned_at,
        unassignedAt: entry.unassigned_at,
        active: Boolean(entry.active),
      })),
    },
  };
};

export const create = async (actor, payload = {}, context = {}) => {
  if (actor.role === ROLES.USER && !actor.aadhaar_verified) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Please complete Aadhaar verification before submitting a complaint."
    );
  }

  const config = await settings.get();
  const cleaned = complaintPayload(payload);

  let wardId = "";

  if (cleaned.wardId) {
    const ward = await wards.findRowById(cleaned.wardId);
    if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
    wardId = ward.id;
  } else if (config.autoAssignWard && cleaned.position) {
    wardId = nearestWardId(await wards.list(), cleaned.position);
  }

  const ward = wardId ? await wards.findRowById(wardId) : null;
  const wardLabel = ward
    ? `Ward ${ward.ward_number ?? "—"} · ${ward.name}`
    : "No ward selected";
  const routedOfficerId = config.autoAssignWard ? ward?.assigned_officer_id || "" : "";
  const routedOfficer = routedOfficerId ? await officers.findById(routedOfficerId) : null;

  // Optional AI metadata. Detection is advisory and can never block a report.
  // A client-side prediction is trusted when present; otherwise the service
  // runs the heuristic/remote classifier itself.
  const clientWaste = String(payload.aiWasteType || "").trim().slice(0, 40);
  const clientConfidence = Number(payload.aiConfidence);
  const detection =
    clientWaste && Number.isFinite(clientConfidence) && clientConfidence > 0
      ? {
          available: true,
          wasteType: clientWaste,
          confidence: Math.max(0, Math.min(1, clientConfidence)),
          provider: "client",
        }
      : await ai.detectWaste({
          image: cleaned.image,
          complaintCategory: cleaned.complaintCategory,
          complaintType: cleaned.complaintType,
          description: cleaned.description,
        });

  let duplicateOfId = "";
  let duplicateScore = null;

  if (payload.duplicateOfId) {
    const original = await complaints.findRowById(String(payload.duplicateOfId)).catch(() => null);
    if (original && original.user_id !== actor.id) {
      duplicateOfId = original.id;
      duplicateScore = 1;
    }
  }

  const created = await complaints.create({
    userId: actor.id,
    wasteType: cleaned.wasteType,
    complaintCategory: cleaned.complaintCategory,
    complaintType: cleaned.complaintType,
    description: cleaned.description,
    address: cleaned.address,
    wardId,
    representativeId: ward?.representative_id || "",
    assignedOfficerId: routedOfficerId,
    priority: cleaned.priority,
    image: cleaned.image,
    position: cleaned.position,
    status: STATUS.PENDING,
    aiWasteType: detection.wasteType || "",
    aiConfidence: detection.available ? detection.confidence : null,
    imageFingerprint:
      String(payload.imageFingerprint || "").slice(0, 64) || ai.fingerprint(cleaned.image),
    duplicateOfId: duplicateOfId || null,
    duplicateScore,
  });

  await complaints.addTimelineEntry(created.id, {
    status: STATUS.PENDING,
    note: "Complaint submitted.",
    by: actor.name,
  });

  await complaints.recordStatusHistory({
    complaintId: created.id,
    fromStatus: "",
    toStatus: STATUS.PENDING,
    note: "Complaint submitted.",
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
  });

  await sendComplaintEmail(created, "complaintSubmitted");

  let finalStatus = STATUS.PENDING;

  // Automatic ward routing: record Displayed → Accepted → Assigned in order so
  // the citizen timeline still shows every stage of the workflow.
  if (routedOfficer) {
    const routingNote = routedOfficer.name
      ? `Auto-assigned to ${routedOfficer.name}${
          routedOfficer.employee_code ? ` (${routedOfficer.employee_code})` : ""
        }${ward ? ` · ${ward.name}` : ""}.`
      : "Auto-assigned to the ward sanitation team.";

    await complaints.updateWorkflow(created.id, { status: STATUS.ASSIGNED });

    await complaints.addTimelineEntry(created.id, {
      status: STATUS.ACCEPTED,
      note: "Complaint accepted by automatic ward routing.",
      by: "System",
    });
    await complaints.recordStatusHistory({
      complaintId: created.id,
      fromStatus: STATUS.PENDING,
      toStatus: STATUS.ACCEPTED,
      note: "Complaint accepted by automatic ward routing.",
      actorId: null,
      actorName: "System",
      actorRole: "system",
    });

    await complaints.addTimelineEntry(created.id, {
      status: STATUS.ASSIGNED,
      note: routingNote,
      by: "System",
    });
    await complaints.recordStatusHistory({
      complaintId: created.id,
      fromStatus: STATUS.ACCEPTED,
      toStatus: STATUS.ASSIGNED,
      note: routingNote,
      actorId: null,
      actorName: "System",
      actorRole: "system",
    });

    await complaints.recordAssignment({
      complaintId: created.id,
      officerId: routedOfficer.id,
      assignedBy: null,
      note: "Automatic ward routing",
    });
    await notifications.create({
      userId: routedOfficer.user_id,
      title: `New complaint assigned: ${complaintCode(created.id)}`,
      body: `${wardLabel} · ${cleaned.address}. Open your dashboard to start the work.`,
      type: "complaint",
      complaintId: created.id,
    });

    await sendComplaintEmail(
      { ...created, status: STATUS.ASSIGNED },
      "complaintAccepted",
      { officerName: routedOfficer.name }
    );
    await sendComplaintEmail(
      { ...created, status: STATUS.ASSIGNED },
      "officerAssigned",
      { officerName: routedOfficer.name }
    );

    finalStatus = STATUS.ASSIGNED;
  }

  await notifications.create({
    userId: actor.id,
    title: `Complaint #${created.id.slice(-6).toUpperCase()} submitted`,
    body: "Your report is with the ward team. We will notify you when its status changes.",
    type: "complaint",
    complaintId: created.id,
  });

  if (config.notifyOnNewComplaint) {
    await notifications.createForUsers(await users.listAdminIds(), {
      title: `New complaint #${created.id.slice(-6).toUpperCase()}`,
      body: `${wardLabel} · ${cleaned.complaintType} reported at ${cleaned.address}.`,
      type: "admin",
      complaintId: created.id,
    });
  }

  // A ward without an assigned sanitation officer cannot be routed
  // automatically. Alert the administrators so the complaint does not sit
  // silently in the pending queue.
  if (!routedOfficer) {
    await notifications.createForUsers(await users.listAdminIds(), {
      title: `Pending queue: ${complaintCode(created.id)}`,
      body: `${wardLabel} has no sanitation officer. Assign a ward officer to route this complaint.`,
      type: "admin",
      complaintId: created.id,
    });
  }

  if (duplicateOfId) {
    const original = await complaints.findRowById(duplicateOfId).catch(() => null);
    await complaints.toggleUpvote(duplicateOfId, actor.id).catch(() => null);

    if (original && original.user_id) {
      await notifications
        .create({
          userId: original.user_id,
          title: "Someone reported the same issue",
          body: `Complaint ${complaintCode(duplicateOfId)} received another “me too” from a neighbour.`,
          type: "upvote",
          complaintId: duplicateOfId,
        })
        .catch(() => null);
    }
  }

  await audit.record({
    actorId: actor.id,
    action: "complaint.created",
    entity: "complaint",
    entityId: created.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      wasteType: created.waste_type,
      complaintCategory: created.complaint_category || "",
      complaintType: created.complaint_type || "",
      wardId: created.ward_id || "",
      autoRouted: Boolean(routedOfficer),
      aiProvider: detection.provider,
    },
  });

  const { complaint } = await get(created.id, actor);
  return { complaint, aiDetection: detection, status: finalStatus };
};

export const upvote = async (id, actor) => {
  const row = await requireComplaintRow(id);
  const { added } = await complaints.toggleUpvote(id, actor.id);

  if (added && row.user_id !== actor.id) {
    await notifications.create({
      userId: row.user_id,
      title: "Someone supported your complaint",
      body: `${actor.name} marked complaint #${id.slice(-6).toUpperCase()} as "me too".`,
      type: "upvote",
      complaintId: id,
    });
  }

  const { complaint } = await get(id, actor);

  return {
    complaint,
    message: added ? "Thanks for supporting this report." : "Your support was removed.",
  };
};

export const addComment = async (id, actor, payload = {}) => {
  const row = await requireComplaintRow(id);
  const text = commentText(payload.text);

  const comment = await complaints.addComment(id, actor.id, text);

  if (row.user_id !== actor.id) {
    await notifications.create({
      userId: row.user_id,
      title: "New comment on your complaint",
      body: `${actor.name}: ${text.slice(0, 140)}`,
      type: "comment",
      complaintId: id,
    });
  }

  const { complaint } = await get(id, actor);

  return {
    complaint,
    comment: complaintComment({ ...comment, user_name: actor.name }),
  };
};

const statusNote = (status) => {
  if (status === STATUS.RESOLVED) return "Work completed. Awaiting citizen verification.";
  if (status === STATUS.CITIZEN_VERIFICATION) {
    return "Work completed. Awaiting citizen verification.";
  }
  if (status === STATUS.CLOSED) return "The citizen confirmed the issue is resolved.";
  if (status === STATUS.REOPENED) return "The citizen reported that the issue is not resolved.";
  if (status === STATUS.REJECTED) return "Report closed by the city team.";
  if (status === STATUS.ACCEPTED) return "The complaint has been accepted by the ward team.";
  if (status === STATUS.ASSIGNED) return "A sanitation officer has been assigned.";
  if (status === STATUS.IN_PROGRESS) return "Sanitation work has started.";
  return "Status moved back to Pending.";
};

export const updateStatus = async (actor, id, payload = {}, context = {}) => {
  requireAdmin(actor);

  const status = statusValue(payload.status);
  const row = await requireComplaintRow(id);

  if (row.status === status) {
    throw new AppError(ERROR_CODES.CONFLICT, `This complaint is already marked ${status}.`);
  }

  const note = String(payload.note || "").trim() || statusNote(status);

  if (status === STATUS.RESOLVED || status === STATUS.CITIZEN_VERIFICATION) {
    await requestVerification(row, actor, { ...payload, note }, context);
    const { complaint } = await get(id, actor);
    return { complaint, message: "Complaint resolved. The citizen has been asked to verify." };
  }

  await applyStatus(row, actor, status, note, context);

  await notifications.create({
    userId: row.user_id,
    title: `Complaint ${complaintCode(id)} is now ${status}`,
    body: note,
    type: "status",
    complaintId: id,
  });

  if (EMAIL_BY_STATUS[status]) {
    await sendComplaintEmail(row, EMAIL_BY_STATUS[status], { status });
  }

  if (status === STATUS.REOPENED) {
    await notifyAdmins({
      title: `Complaint ${complaintCode(id)} reopened`,
      body: `${row.address} was reopened after review.`,
      type: "admin",
      complaintId: id,
    });
    await notifyOfficer(row.assigned_officer_id, {
      title: `Complaint ${complaintCode(id)} reopened`,
      body: `${row.address} needs another visit.`,
      type: "status",
      complaintId: id,
    });
  }

  const { complaint } = await get(id, actor);
  return { complaint, message: `Complaint marked as ${status}.` };
};

export const accept = async (actor, id, payload = {}, context = {}) => {
  if (!actor || ![ROLES.ADMIN, ROLES.OFFICER].includes(actor.role)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Only administrators and sanitation officers can accept a complaint."
    );
  }

  const row = await requireComplaintRow(id);

  if (actor.role === ROLES.OFFICER) {
    const officer = await officerForActor(actor);
    requireAssigned(row, officer);
  }

  if (![STATUS.PENDING, STATUS.REOPENED].includes(row.status)) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      `This complaint is already ${row.status.toLowerCase()}.`
    );
  }

  const note = String(payload.note || "").trim() || statusNote(STATUS.ACCEPTED);
  await applyStatus(row, actor, STATUS.ACCEPTED, note, context);

  await notifications.create({
    userId: row.user_id,
    title: `Complaint ${complaintCode(id)} accepted`,
    body: note,
    type: "status",
    complaintId: id,
  });

  await sendComplaintEmail(row, "complaintAccepted", { status: STATUS.ACCEPTED });

  const { complaint } = await get(id, actor);
  return { complaint, message: "Complaint accepted." };
};

export const assign = async (actor, id, payload = {}, context = {}) => {
  requireAdmin(actor);

  const row = await requireComplaintRow(id);
  const wardId = payload.wardId ? String(payload.wardId) : "";
  const representativeId = payload.representativeId ? String(payload.representativeId) : "";
  const hasOfficerField = payload.officerId !== undefined;
  const officerId = payload.officerId ? String(payload.officerId) : "";

  let ward = null;
  if (wardId) {
    ward = await wards.findRowById(wardId);
    if (!ward) throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid ward.");
  }

  let representative = null;
  if (representativeId) {
    representative = await representatives.findRowById(representativeId);
    if (!representative) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose a valid representative.");
    }
  }

  let officer = null;
  if (officerId) {
    officer = await officers.findById(officerId);
    if (!officer || !officer.is_active) {
      throw new AppError(ERROR_CODES.VALIDATION, "Choose an active sanitation officer.");
    }
  }

  const nextStatus =
    officer && [STATUS.PENDING, STATUS.ACCEPTED, STATUS.REOPENED].includes(row.status)
      ? STATUS.ASSIGNED
      : !officer && row.status === STATUS.ASSIGNED
        ? STATUS.PENDING
        : row.status;

  await withTransaction(async (client) => {
    await complaints.assign(
      id,
      {
        wardId,
        representativeId: representativeId || (ward?.representative_id ?? ""),
        ...(hasOfficerField ? { assignedOfficerId: officerId } : {}),
      },
      client
    );

    if (hasOfficerField) {
      await complaints.closeActiveAssignments(id, client);
      if (officerId) {
        await complaints.recordAssignment(
          {
            complaintId: id,
            officerId,
            assignedBy: actor.id,
            note: String(payload.note || "").trim(),
          },
          client
        );
      }
    }

    if (nextStatus !== row.status) {
      await complaints.updateWorkflow(id, { status: nextStatus }, client);
    }

    const assignmentNote = officer
      ? `Assigned to ${officer.name}${
          officer.employee_code ? ` (${officer.employee_code})` : ""
        }${ward ? ` · ${ward.name} · ${ward.area}` : ""}${
          representative ? ` · ${representative.name}` : ""
        }.`
      : `Assigned to ${ward ? `${ward.name} · ${ward.area}` : "no ward"}${
          representative ? ` · ${representative.name}` : ""
        }.`;

    await complaints.addTimelineEntry(
      id,
      { status: nextStatus, note: assignmentNote, by: actor.name },
      client
    );

    if (nextStatus !== row.status) {
      await complaints.recordStatusHistory(
        {
          complaintId: id,
          fromStatus: row.status,
          toStatus: nextStatus,
          note: assignmentNote,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: ROLES.ADMIN,
        },
        client
      );
    }

    if (officer) {
      await notifications.create(
        {
          userId: row.user_id,
          title: `Complaint ${complaintCode(id)} assigned`,
          body: `Your report was assigned to sanitation officer ${officer.name}.`,
          type: "status",
          complaintId: id,
        },
        client
      );

      await notifications.create(
        {
          userId: officer.user_id,
          title: `New complaint assigned: ${complaintCode(id)}`,
          body: `${row.address}. Open your dashboard to start the work.`,
          type: "complaint",
          complaintId: id,
        },
        client
      );
    }
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.complaint_assigned",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { wardId, representativeId, officerId, previousOfficerId: row.assigned_officer_id || "" },
  });

  if (officer) {
    await sendComplaintEmail(row, "officerAssigned", {
      status: STATUS.ASSIGNED,
      officerName: officer.name,
    });
  }

  const { complaint } = await get(id, actor);

  return {
    complaint,
    message: officer
      ? `Assigned to ${officer.name}${ward ? ` · ${ward.name}` : ""}.`
      : `Assigned to ${ward ? `${ward.name} · ${ward.area}` : "Unassigned ward"} · ${
          representative ? representative.name : "Not assigned"
        }.`,
  };
};

/* ------------------------- officer workspace ------------------------- */

export const officerDashboard = async (actor) => {
  const officer = await officerForActor(actor);
  const [stats, statusRows] = await Promise.all([
    officers.dashboardStats(officer.id),
    officers.countByStatus(officer.id),
  ]);

  const { rows } = await complaints.list({
    actorId: actor.id,
    assignedOfficerId: officer.id,
    page: 1,
    limit: 6,
    sort: "newest",
  });

  const statusCounts = Object.fromEntries(STATUS_LIST.map((status) => [status, 0]));
  for (const entry of statusRows) statusCounts[entry.status] = entry.count;

  return {
    officer: {
      id: officer.id,
      name: officer.name,
      email: officer.email,
      employeeCode: officer.employee_code || "",
      designation: officer.designation,
      zone: officer.zone,
    },
    stats: {
      total: stats.total,
      pending: stats.pending,
      inProgress: stats.in_progress,
      resolved: stats.resolved,
      assignedToday: stats.assigned_today,
    },
    statusCounts,
    recent: await attachTimelines(rows),
  };
};

export const officerList = (query = {}, actor) => list(query, actor);

export const officerGet = (id, actor) => get(id, actor);

export const officerUpdateWork = async (actor, id, payload = {}, context = {}) => {
  const officer = await officerForActor(actor);
  const row = await requireComplaintRow(id);
  requireAssigned(row, officer);

  const beforePhoto = photoValue(payload.beforePhoto, "Before cleaning photo");
  const afterPhoto = photoValue(payload.afterPhoto, "After cleaning photo");
  const notes = workNotesRule(payload.workNotes);

  const changes = {};
  if (payload.beforePhoto !== undefined) changes.beforePhoto = beforePhoto;
  if (payload.afterPhoto !== undefined) changes.afterPhoto = afterPhoto;
  if (payload.workNotes !== undefined) changes.workNotes = notes;

  if (Object.keys(changes).length) {
    await complaints.updateOfficerWork(id, changes);

    const summary =
      String(payload.note || "").trim() ||
      (notes ? `Work notes: ${notes.slice(0, 180)}` : "Work photos updated.");

    await complaints.addTimelineEntry(id, {
      status: row.status,
      note: summary,
      by: actor.name,
    });
  }

  await audit.record({
    actorId: actor.id,
    action: "officer.work_updated",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      beforePhoto: payload.beforePhoto !== undefined,
      afterPhoto: payload.afterPhoto !== undefined,
      workNotes: payload.workNotes !== undefined,
    },
  });

  const { complaint } = await get(id, actor);
  return { complaint, message: "Work details saved." };
};

/**
 * Administrators can record the before/after photos and work notes too, so a
 * ward engineer can hand the evidence to the city office when the assigned
 * officer is unavailable. The payload is validated exactly like the officer
 * console, and every edit is written to the complaint timeline.
 */
export const adminUpdateWork = async (actor, id, payload = {}, context = {}) => {
  if (!actor || actor.role !== ROLES.ADMIN) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Only the assigned officer or an administrator can upload work photos."
    );
  }

  const row = await requireComplaintRow(id);

  const changes = {};
  if (payload.beforePhoto !== undefined) {
    changes.beforePhoto = photoValue(payload.beforePhoto, "Before cleaning photo");
  }
  if (payload.afterPhoto !== undefined) {
    changes.afterPhoto = photoValue(payload.afterPhoto, "After cleaning photo");
  }
  if (payload.workNotes !== undefined) changes.workNotes = workNotesRule(payload.workNotes);

  if (Object.keys(changes).length) {
    await complaints.updateOfficerWork(id, changes);

    const summary =
      String(payload.note || "").trim() ||
      (changes.workNotes
        ? `Work notes: ${changes.workNotes.slice(0, 180)}`
        : "Work photos updated by the city office.");

    await complaints.addTimelineEntry(id, {
      status: row.status,
      note: summary,
      by: actor.name,
    });
  }

  await audit.record({
    actorId: actor.id,
    action: "admin.work_updated",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      beforePhoto: payload.beforePhoto !== undefined,
      afterPhoto: payload.afterPhoto !== undefined,
      workNotes: payload.workNotes !== undefined,
    },
  });

  const { complaint } = await get(id, actor);
  return { complaint, message: "Work details saved." };
};

export const officerUpdateStatus = async (actor, id, payload = {}, context = {}) => {
  const officer = await officerForActor(actor);
  const row = await requireComplaintRow(id);
  requireAssigned(row, officer);

  const status = statusValue(payload.status);

  if (![STATUS.IN_PROGRESS, STATUS.RESOLVED].includes(status)) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Officers can start work or mark a complaint resolved."
    );
  }

  if (status === STATUS.RESOLVED) {
    if ([STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED].includes(row.status)) {
      throw new AppError(ERROR_CODES.CONFLICT, "This complaint is already resolved.");
    }

    await requestVerification(row, actor, payload, context);
    const { complaint } = await get(id, actor);
    return {
      complaint,
      message: "Complaint resolved. The citizen has been asked to verify the fix.",
    };
  }

  if (row.status === STATUS.IN_PROGRESS) {
    throw new AppError(ERROR_CODES.CONFLICT, "Work is already in progress.");
  }

  if (payload.beforePhoto !== undefined || payload.afterPhoto !== undefined || payload.workNotes !== undefined) {
    const changes = {};
    if (payload.beforePhoto !== undefined) {
      changes.beforePhoto = photoValue(payload.beforePhoto, "Before cleaning photo");
    }
    if (payload.afterPhoto !== undefined) {
      changes.afterPhoto = photoValue(payload.afterPhoto, "After cleaning photo");
    }
    if (payload.workNotes !== undefined) changes.workNotes = workNotesRule(payload.workNotes);
    await complaints.updateOfficerWork(id, changes);
  }

  const note = String(payload.note || "").trim() || "Sanitation work started.";
  await applyStatus(row, actor, STATUS.IN_PROGRESS, note, context);

  await notifications.create({
    userId: row.user_id,
    title: `Work started on complaint ${complaintCode(id)}`,
    body: `${officer.name} has started work at ${row.address}.`,
    type: "status",
    complaintId: id,
  });

  await sendComplaintEmail(row, "workStarted", {
    status: STATUS.IN_PROGRESS,
    officerName: officer.name,
  });

  const { complaint } = await get(id, actor);
  return { complaint, message: "Work started. The citizen has been notified." };
};

/* -------------------------- citizen verification ---------------------- */

export const verify = async (id, actor, payload = {}, context = {}) => {
  if (!actor) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");

  const row = await requireComplaintRow(id);

  if (actor.role === ROLES.OFFICER) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Officers cannot verify a citizen's complaint.");
  }

  if (actor.role !== ROLES.ADMIN && row.user_id !== actor.id) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Only the citizen who reported this issue can verify it.");
  }

  if (![STATUS.RESOLVED, STATUS.CITIZEN_VERIFICATION].includes(row.status)) {
    throw new AppError(ERROR_CODES.CONFLICT, "This complaint is not awaiting citizen verification.");
  }

  const resolved = verificationDecision(payload.resolved);

  if (resolved) {
    await complaints.updateWorkflow(id, {
      status: STATUS.CLOSED,
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
      verified_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    });

    await recordStatus(row, {
      status: STATUS.CLOSED,
      note: String(payload.note || "").trim() || "Citizen confirmed the issue is resolved.",
      actor,
    });

    await complaints.recordVerification({
      complaintId: id,
      decision: "verified",
      note: String(payload.note || "").trim() || "Citizen confirmed the issue is resolved.",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    });

    await sendComplaintEmail(row, "complaintClosed", { status: STATUS.CLOSED });

    await notifyOfficer(row.assigned_officer_id, {
      title: `Complaint ${complaintCode(id)} closed`,
      body: "The citizen confirmed the issue is resolved.",
      type: "status",
      complaintId: id,
    });
    await notifyAdmins({
      title: `Complaint ${complaintCode(id)} closed`,
      body: `${row.address} was verified and closed by the citizen.`,
      type: "admin",
      complaintId: id,
    });

    await audit.record({
      actorId: actor.id,
      action: "complaint.citizen_verified",
      entity: "complaint",
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { decision: "resolved" },
    });

    const { complaint } = await get(id, actor);
    return { complaint, message: "Thank you. The complaint is now closed." };
  }

  await complaints.updateWorkflow(id, {
    status: STATUS.REOPENED,
    verificationStatus: VERIFICATION_STATUS.REOPENED,
    reopened_at: new Date().toISOString(),
  });

  await recordStatus(row, {
    status: STATUS.REOPENED,
    note: String(payload.note || "").trim() || "Citizen reported that the issue is not resolved.",
    actor,
  });

  await complaints.recordVerification({
    complaintId: id,
    decision: "reopened",
    note: String(payload.note || "").trim() || "Citizen reported that the issue is not resolved.",
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
  });

  await sendComplaintEmail(row, "complaintReopened", { status: STATUS.REOPENED });

  await notifyAdmins({
    title: `Complaint ${complaintCode(id)} reopened`,
    body: `The citizen says the issue at ${row.address} is not resolved.`,
    type: "admin",
    complaintId: id,
  });
  await notifyOfficer(row.assigned_officer_id, {
    title: `Complaint ${complaintCode(id)} reopened`,
    body: "The citizen reported that the issue is not resolved. Please revisit the site.",
    type: "status",
    complaintId: id,
  });

  await audit.record({
    actorId: actor.id,
    action: "complaint.citizen_reopened",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { decision: "not_resolved" },
  });

  const { complaint } = await get(id, actor);
  return {
    complaint,
    message: "The complaint was reopened and the city team has been notified.",
  };
};

export const checkDuplicates = async (payload = {}, actor) => {
  if (!actor) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");

  const categoryInput = String(payload.complaintCategory || "").trim();
  const typeInput = String(payload.complaintType || payload.wasteType || "").trim();
  const category = findComplaintCategory(categoryInput) || findCategoryForIssue(typeInput);

  const rawPosition = Array.isArray(payload.position) ? payload.position.map(Number) : null;
  const position =
    rawPosition &&
    rawPosition.length === 2 &&
    rawPosition.every(Number.isFinite) &&
    Math.abs(rawPosition[0]) <= 90 &&
    Math.abs(rawPosition[1]) <= 180
      ? rawPosition
      : null;

  if (!category && !position) return { matches: [] };

  const rows = await complaints.findDuplicateCandidates({
    categoryId: category?.id || "",
    position,
    days: 30,
    limit: 20,
    excludeId: payload.excludeId ? String(payload.excludeId) : "",
  });

  const fingerprint =
    String(payload.imageFingerprint || "") || ai.fingerprint(payload.image);
  const thresholdKm = 0.35;

  const matches = rows
    .map((row) => {
      const distance = row.distance_km === null || row.distance_km === undefined
        ? null
        : Number(row.distance_km);
      const sameImage = Boolean(
        fingerprint && row.image_fingerprint && fingerprint === row.image_fingerprint
      );
      const nearby = distance !== null && Number.isFinite(distance) && distance <= thresholdKm;

      if (!sameImage && !nearby) return null;

      const score = sameImage
        ? 1
        : Math.max(0.4, Math.min(0.95, 1 - distance / (thresholdKm * 1.3)));

      return {
        id: row.id,
        code: complaintCode(row.id),
        userName: row.user_name || "Resident",
        complaintCategory: row.complaint_category || GARBAGE_CATEGORY_ID,
        complaintType: row.complaint_type || row.waste_type || "",
        address: row.address || "",
        ward: row.ward_name || "Unassigned",
        status: row.status,
        image: row.image || "",
        upvotes: Number(row.upvotes || 0),
        createdAt: row.created_at,
        distanceKm: distance === null ? null : Math.round(distance * 100) / 100,
        sameImage,
        score: Math.round(score * 100) / 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { matches };
};

export const myStats = async (actor) => {
  const { counts, upvotesReceived } = await complaints.myStats(actor.id);

  const { rows } = await complaints.list({
    actorId: actor.id,
    userId: actor.id,
    page: 1,
    limit: 5,
    sort: "newest",
  });

  return {
    total: counts.total,
    pending: counts.pending,
    inProgress: counts.in_progress,
    resolved: counts.resolved,
    rejected: counts.rejected,
    upvotesReceived,
    averageDays: round(counts.average_days),
    recent: await attachTimelines(rows),
  };
};

export const analytics = async (actor) => {
  requireAdmin(actor);

  const config = await settings.get();

  const [
    totals,
    wasteRows,
    categoryRows,
    wardRows,
    residentCounts,
    wardList,
    repList,
    recentDates,
    topRows,
    monthlyRows,
    dailyRows,
    officerRows,
    bucketRows,
  ] = await Promise.all([
    complaints.analyticsTotals(),
    complaints.countByWaste(),
    complaints.countByCategory(),
    wards.wardStats(),
    users.countResidents(),
    wards.list(),
    representatives.list(),
    complaints.createdSince(new Date(Date.now() - 6 * 86_400_000)),
    complaints.topComplaints(actor.id, 5),
    complaints.monthlyCounts(12),
    complaints.dailyCounts(14),
    complaints.officerPerformance(),
    complaints.resolutionBuckets(),
  ]);

  const byStatusCounts = {
    [STATUS.PENDING]: totals.pending,
    [STATUS.ACCEPTED]: totals.accepted,
    [STATUS.ASSIGNED]: totals.assigned,
    [STATUS.IN_PROGRESS]: totals.in_progress,
    [STATUS.RESOLVED]: totals.resolved,
    [STATUS.CITIZEN_VERIFICATION]: totals.citizen_verification,
    [STATUS.CLOSED]: totals.closed,
    [STATUS.REOPENED]: totals.reopened,
    [STATUS.REJECTED]: totals.rejected,
  };

  const wasteCounts = Object.fromEntries(wasteRows.map((row) => [row.waste_type, row.count]));
  const categoryCounts = Object.fromEntries(
    categoryRows.map((row) => [row.complaint_category, row.count])
  );

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000);
    const label = date.toLocaleDateString("en-IN", { weekday: "short" });
    const value = recentDates.filter(
      (createdAt) => new Date(createdAt).toDateString() === date.toDateString()
    ).length;
    return { label, value };
  });

  const monthMap = new Map(monthlyRows.map((row) => [row.month, row]));
  const byMonth = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (11 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = monthMap.get(key);
    return {
      label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      key,
      value: row?.total || 0,
      resolved: row?.resolved || 0,
    };
  });

  const dayMap = new Map(dailyRows.map((row) => [row.day, row.total]));
  const byDay = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.now() - (13 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      key,
      value: dayMap.get(key) || 0,
    };
  });

  const byOfficer = officerRows.map((row) => ({
    id: row.id,
    label: row.officer_name || row.employee_code || "Officer",
    value: row.total,
    resolved: row.resolved,
    inProgress: row.in_progress,
    pending: row.pending,
    averageDays: Number(row.average_days) || 0,
    zone: row.zone || "",
  }));

  const resolutionBuckets = [
    { label: "Within 1 day", value: bucketRows.within_1 || 0 },
    { label: "1–3 days", value: bucketRows.within_3 || 0 },
    { label: "3–7 days", value: bucketRows.within_7 || 0 },
    { label: "Over 7 days", value: bucketRows.over_7 || 0 },
  ];

  // A cumulative trend line makes slow weeks visible even when daily volume is
  // small, and reuses the same month buckets as the monthly chart.
  let running = 0;
  const trend = byMonth.map((row) => {
    running += row.value;
    return { label: row.label, value: running, monthly: row.value };
  });

  // The workflow completes in two steps (officer resolve, citizen verify), so
  // every post-work status counts towards the admin "resolved" figure.
  const completed = totals.resolved + totals.citizen_verification + totals.closed;

  return {
    totals: {
      complaints: totals.complaints,
      pending: totals.pending,
      accepted: totals.accepted,
      assigned: totals.assigned,
      inProgress: totals.in_progress,
      resolved: completed,
      citizenVerification: totals.citizen_verification,
      closed: totals.closed,
      reopened: totals.reopened,
      rejected: totals.rejected,
      users: residentCounts.total,
      blockedUsers: residentCounts.blocked,
      wards: wardList.length,
      representatives: repList.length,
      upvotes: totals.upvotes,
      resolutionRate: totals.complaints
        ? Math.round((completed / totals.complaints) * 100)
        : 0,
      averageResolutionDays: round(totals.average_resolution_days),
      slaDays: config.slaDays,
    },
    byStatus: STATUS_LIST.map((status) => ({
      label: status,
      value: byStatusCounts[status] || 0,
    })),
    byWaste: WASTE_TYPES.map((type) => ({
      label: type,
      value: wasteCounts[type] || 0,
    })).filter((row) => row.value > 0),
    byCategory: COMPLAINT_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      value: categoryCounts[category.id] || 0,
    })),
    byWard: wardRows.map((row) => ({
      id: row.id,
      label: `Ward ${row.ward_number ?? "—"} · ${row.name}`,
      wardNumber: row.ward_number,
      wardName: row.name,
      area: row.area,
      zoneNumber: row.zone_number,
      assemblyConstituency: row.assembly_constituency || "",
      councillorName: row.councillor_name || "",
      value: row.total,
      total: row.total,
      pending: row.pending,
      resolved: row.resolved,
      averageResolutionDays: Number(row.average_days) || 0,
      topCategory: row.top_category ? complaintCategoryLabel(row.top_category) : "",
    })),
    lastSevenDays,
    byMonth,
    byDay,
    byOfficer,
    resolutionBuckets,
    trend,
    topComplaints: topRows.map((row) => serializeComplaint(row)),
  };
};
