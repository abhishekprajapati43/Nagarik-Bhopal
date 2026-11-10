import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { STATUS, STATUS_LIST, WASTE_TYPES } from "../../shared/constants.js";
import {
  commentText,
  complaintPayload,
  statusValue,
} from "../../shared/validation.js";
import * as complaints from "../repositories/complaint.repository.js";
import * as wards from "../repositories/ward.repository.js";
import * as representatives from "../repositories/representative.repository.js";
import * as users from "../repositories/user.repository.js";
import * as notifications from "../repositories/notification.repository.js";
import * as settings from "../repositories/settings.repository.js";
import * as audit from "../repositories/audit.repository.js";
import { pageMeta, pagination } from "../utils/pagination.js";
import { requireAdmin } from "../utils/authz.js";
import {
  complaint as serializeComplaint,
  complaintComment,
  timelineEntry,
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

  const { rows, total, statusCounts: counts } = await complaints.list({
    actorId: actor?.id || "",
    userId: query.scope === "mine" ? actor.id : query.userId || "",
    status: query.status || "",
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

  const [commentRows, timelineRows] = await Promise.all([
    complaints.listComments(id),
    complaints.listTimeline(id),
  ]);

  return {
    complaint: {
      ...withTimeline(row, timelineRows),
      comments: commentRows.map(complaintComment),
    },
  };
};

export const create = async (actor, payload = {}, context = {}) => {
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

  const created = await complaints.create({
    userId: actor.id,
    wasteType: cleaned.wasteType,
    description: cleaned.description,
    address: cleaned.address,
    wardId,
    representativeId: ward?.representative_id || "",
    priority: cleaned.priority,
    image: cleaned.image,
    position: cleaned.position,
    status: STATUS.PENDING,
  });

  await complaints.addTimelineEntry(created.id, {
    status: STATUS.PENDING,
    note: "Complaint submitted.",
    by: actor.name,
  });

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
      body: `${cleaned.wasteType} reported at ${cleaned.address}.`,
      type: "admin",
      complaintId: created.id,
    });
  }

  await audit.record({
    actorId: actor.id,
    action: "complaint.created",
    entity: "complaint",
    entityId: created.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { wasteType: created.waste_type, wardId: created.ward_id || "" },
  });

  const { complaint } = await get(created.id, actor);
  return { complaint };
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
  if (status === STATUS.RESOLVED) return "Marked resolved by the city team.";
  if (status === STATUS.REJECTED) return "Report closed by the city team.";
  if (status === STATUS.IN_PROGRESS) return "Team assigned and work started.";
  return "Status moved back to Pending.";
};

export const updateStatus = async (actor, id, payload = {}, context = {}) => {
  requireAdmin(actor);

  const status = statusValue(payload.status);
  const row = await requireComplaintRow(id);

  if (row.status === status) {
    throw new AppError(ERROR_CODES.CONFLICT, `This complaint is already marked ${status}.`);
  }

  await complaints.updateStatus(id, status);

  await complaints.addTimelineEntry(id, {
    status,
    note: String(payload.note || "").trim() || statusNote(status),
    by: actor.name,
  });

  await notifications.create({
    userId: row.user_id,
    title: `Complaint #${id.slice(-6).toUpperCase()} is now ${status}`,
    body: statusNote(status),
    type: "status",
    complaintId: id,
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.complaint_status_changed",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { from: row.status, to: status },
  });

  const { complaint } = await get(id, actor);
  return { complaint, message: `Complaint marked as ${status}.` };
};

export const assign = async (actor, id, payload = {}, context = {}) => {
  requireAdmin(actor);

  const row = await requireComplaintRow(id);
  const wardId = payload.wardId ? String(payload.wardId) : "";
  const representativeId = payload.representativeId ? String(payload.representativeId) : "";

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

  await complaints.assign(id, {
    wardId,
    representativeId: representativeId || (ward?.representative_id ?? ""),
  });

  await complaints.addTimelineEntry(id, {
    status: row.status,
    note: `Assigned to ${ward ? `${ward.name} · ${ward.area}` : "no ward"}${
      representative ? ` · ${representative.name}` : ""
    }.`,
    by: actor.name,
  });

  await notifications.create({
    userId: row.user_id,
    title: `Complaint #${id.slice(-6).toUpperCase()} assigned`,
    body: `Your report was assigned to ${ward ? ward.name : "the city team"}${
      representative ? ` (${representative.name})` : ""
    }.`,
    type: "status",
    complaintId: id,
  });

  await audit.record({
    actorId: actor.id,
    action: "admin.complaint_assigned",
    entity: "complaint",
    entityId: id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { wardId, representativeId },
  });

  const { complaint } = await get(id, actor);

  return {
    complaint,
    message: `Assigned to ${ward ? `${ward.name} · ${ward.area}` : "Unassigned ward"} · ${
      representative ? representative.name : "Not assigned"
    }.`,
  };
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

  const [totals, wasteRows, wardRows, residentCounts, wardList, repList, recentDates, topRows] =
    await Promise.all([
      complaints.analyticsTotals(),
      complaints.countByWaste(),
      complaints.wardBreakdown(),
      users.countResidents(),
      wards.list(),
      representatives.list(),
      complaints.createdSince(new Date(Date.now() - 6 * 86_400_000)),
      complaints.topComplaints(actor.id, 5),
    ]);

  const byStatusCounts = {
    [STATUS.PENDING]: totals.pending,
    [STATUS.IN_PROGRESS]: totals.in_progress,
    [STATUS.RESOLVED]: totals.resolved,
    [STATUS.REJECTED]: totals.rejected,
  };

  const wasteCounts = Object.fromEntries(wasteRows.map((row) => [row.waste_type, row.count]));

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000);
    const label = date.toLocaleDateString("en-IN", { weekday: "short" });
    const value = recentDates.filter(
      (createdAt) => new Date(createdAt).toDateString() === date.toDateString()
    ).length;
    return { label, value };
  });

  return {
    totals: {
      complaints: totals.complaints,
      pending: totals.pending,
      inProgress: totals.in_progress,
      resolved: totals.resolved,
      rejected: totals.rejected,
      users: residentCounts.total,
      blockedUsers: residentCounts.blocked,
      wards: wardList.length,
      representatives: repList.length,
      upvotes: totals.upvotes,
      resolutionRate: totals.complaints
        ? Math.round((totals.resolved / totals.complaints) * 100)
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
    byWard: wardRows.map((row) => ({
      label: `${row.name} · ${row.area}`,
      value: row.total,
      resolved: row.resolved,
    })),
    lastSevenDays,
    topComplaints: topRows.map((row) => serializeComplaint(row)),
  };
};
