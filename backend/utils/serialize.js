/** Convert database rows into the exact camelCase shapes the frontend uses. */

import {
  GARBAGE_CATEGORY_ID,
  complaintCategoryLabel,
  findCategoryForIssue,
  findComplaintCategory,
} from "../../shared/constants.js";

/**
 * Resolve the civic category for a row. Rows written before the category
 * rollout only carry `waste_type`, so they fall back to Garbage Collection.
 */
const resolvedCategory = (row) => {
  const explicit = findComplaintCategory(row.complaint_category);
  if (explicit) return explicit.id;

  const inferred =
    findCategoryForIssue(row.complaint_type) || findCategoryForIssue(row.waste_type);
  return inferred?.id || GARBAGE_CATEGORY_ID;
};

export const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const publicUser = (row) => {
  const last4 = row.aadhaar_last4 || "";

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    wardId: row.ward_id || "",
    role: row.role,
    status: row.status,
    // Only the masked identity is ever serialized. aadhaar_number and
    // aadhaar_hash stay in the database and never leave the server.
    aadhaarLast4: last4,
    aadhaarMasked: last4 ? `XXXX XXXX ${last4}` : "XXXX XXXX ----",
    aadhaarVerified: Boolean(row.aadhaar_verified),
    aadhaarVerifiedAt: iso(row.aadhaar_verified_at),
    aadhaarSubmittedAt: iso(row.aadhaar_submitted_at),
    verificationStatus: row.verification_status || "Pending",
    verificationRemarks: row.verification_remarks || "",
    createdAt: iso(row.created_at),
  };
};

/** Admin verification queue row: masked Aadhaar plus ward and contact. */
export const citizenVerification = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email || "",
  phone: row.phone || "",
  ward: row.ward_name || "Unassigned",
  aadhaarLast4: row.aadhaar_last4 || "",
  aadhaarMasked: row.aadhaar_last4 ? `XXXX XXXX ${row.aadhaar_last4}` : "XXXX XXXX ----",
  aadhaarVerified: Boolean(row.aadhaar_verified),
  aadhaarVerifiedAt: iso(row.aadhaar_verified_at),
  aadhaarSubmittedAt: iso(row.aadhaar_submitted_at),
  verificationStatus: row.verification_status || "Pending",
  verificationRemarks: row.verification_remarks || "",
  createdAt: iso(row.created_at),
});

export const userWithStats = (row) => ({
  ...publicUser(row),
  ward: row.ward_name || "Unassigned",
  complaints: number(row.complaint_count),
});

export const ward = (row) => ({
  id: row.id,
  wardNumber: row.ward_number === null || row.ward_number === undefined ? null : number(row.ward_number),
  name: row.name,
  wardName: row.name,
  area: row.area,
  zone: row.zone,
  zoneNumber: row.zone_number === null || row.zone_number === undefined ? null : number(row.zone_number),
  assemblyConstituency: row.assembly_constituency || "",
  councillorName: row.councillor_display_name || row.councillor_name || "",
  councillorMobile: row.councillor_display_mobile || row.councillor_mobile || "",
  population: row.population === null || row.population === undefined ? null : number(row.population),
  isDefault: Boolean(row.is_default),
  center: [number(row.center_lat), number(row.center_lng)],
  representativeId: row.representative_id || "",
  representative: row.representative_name || "Not assigned",
  representativeDesignation: row.representative_designation || "",
  representativePhone: row.representative_phone || "",
  representativeEmail: row.representative_email || "",
  mlaName: row.representative_mla || "",
  officeAddress: row.representative_office || "",
  assignedOfficerId: row.assigned_officer_id || "",
  officerId: row.assigned_officer_id || "",
  assignedOfficer: row.officer_name || "",
  assignedOfficerCode: row.officer_code || "",
  assignedOfficerPhone: row.officer_phone || "",
  complaints: number(row.complaint_count),
  pending: number(row.pending_count),
  resolved: number(row.resolved_count),
  averageResolutionDays: number(row.average_resolution_days),
  assigned: Boolean(row.assigned),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export const representative = (row) => ({
  id: row.id,
  name: row.name,
  designation: row.designation,
  phone: row.phone || "",
  email: row.email || "",
  mlaName: row.mla_name || "",
  officeAddress: row.office_address || "",
  wardId: row.ward_id || "",
  ward: row.ward_name || "Unassigned",
  complaints: number(row.complaint_count),
  createdAt: iso(row.created_at),
});

export const officer = (row) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name || row.officer_name || "Officer",
  email: row.email || row.officer_email || "",
  phone: row.phone || row.officer_phone || "",
  employeeCode: row.employee_code || "",
  designation: row.designation || "Sanitation Officer",
  zone: row.zone || "Central",
  active: row.is_active === undefined ? true : Boolean(row.is_active),
  complaints: number(row.complaint_count),
  resolved: number(row.resolved_count),
  createdAt: iso(row.created_at),
});

export const complaint = (row) => {
  const finished = ["Resolved", "Citizen Verification", "Closed", "Rejected"].includes(
    row.status
  );
  const end = finished ? new Date(row.updated_at) : new Date();
  const days = Math.max(0, Math.floor((end - new Date(row.created_at)) / 86_400_000));
  const complaintCategory = resolvedCategory(row);
  const complaintType = row.complaint_type || row.waste_type || "";

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    complaintCategory,
    complaintCategoryLabel: complaintCategoryLabel(complaintCategory),
    complaintType,
    wasteType: row.waste_type || complaintType,
    description: row.description,
    address: row.address,
    wardId: row.ward_id || "",
    ward: row.ward_name || "Unassigned",
    wardNumber: row.ward_number === null || row.ward_number === undefined
      ? null
      : number(row.ward_number),
    wardArea: row.ward_area || "",
    wardZone: row.ward_zone || "",
    wardZoneNumber: row.ward_zone_number === null || row.ward_zone_number === undefined
      ? null
      : number(row.ward_zone_number),
    wardAssemblyConstituency: row.ward_assembly_constituency || "",
    wardCouncillorName: row.ward_councillor_name || "",
    wardCouncillorMobile: row.ward_councillor_mobile || "",
    wardPopulation: row.ward_population === null || row.ward_population === undefined
      ? null
      : number(row.ward_population),
    representativeId: row.representative_id || "",
    representative: row.ward_councillor_name || row.representative_name || "Not assigned",
    representativePhone: row.ward_councillor_mobile || row.representative_phone || "",
    representativeEmail: row.representative_email || "",
    mlaName: row.representative_mla || "",
    officeAddress: row.representative_office || "",
    assignedOfficerId: row.assigned_officer_id || "",
    assignedOfficer: row.officer_name || "",
    assignedOfficerCode: row.officer_code || "",
    assignedOfficerZone: row.officer_zone || "",
    assignedOfficerPhone: row.officer_phone || "",
    status: row.status,
    priority: row.priority,
    image: row.image || "",
    beforePhoto: row.before_photo || "",
    afterPhoto: row.after_photo || "",
    workNotes: row.work_notes || "",
    aiWasteType: row.ai_waste_type || "",
    aiConfidence: row.ai_confidence === null || row.ai_confidence === undefined
      ? null
      : number(row.ai_confidence),
    imageFingerprint: row.image_fingerprint || "",
    duplicateOfId: row.duplicate_of_id || "",
    duplicateScore: row.duplicate_score === null || row.duplicate_score === undefined
      ? null
      : number(row.duplicate_score),
    verificationStatus: row.verification_status || "not_requested",
    verificationPending:
      row.verification_status === "pending" ||
      row.status === "Resolved" ||
      row.status === "Citizen Verification",
    verifiedAt: iso(row.verified_at),
    resolvedAt: iso(row.resolved_at),
    closedAt: iso(row.closed_at),
    reopenedAt: iso(row.reopened_at),
    position:
      row.latitude !== null && row.longitude !== null
        ? [number(row.latitude), number(row.longitude)]
        : null,
    upvotes: number(row.upvotes),
    upvoted: Boolean(row.upvoted),
    commentCount: number(row.comment_count),
    days,
    mla: `Bhopal ${row.ward_zone || "Central"}`,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

export const complaintComment = (row) => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name || "Resident",
  text: row.body,
  createdAt: iso(row.created_at),
});

export const timelineEntry = (row) => ({
  id: Number(row.id),
  status: row.status,
  note: row.note,
  by: row.actor_name,
  at: iso(row.created_at),
});

export const statusHistoryEntry = (row) => ({
  id: Number(row.id),
  from: row.from_status || "",
  to: row.to_status,
  note: row.note || "",
  by: row.actor_name || "System",
  role: row.actor_role || "",
  at: iso(row.created_at),
});

export const verificationHistoryEntry = (row) => ({
  id: Number(row.id),
  decision: row.decision,
  note: row.note || "",
  by: row.actor_name || "System",
  role: row.actor_role || "",
  at: iso(row.created_at),
});

export const notification = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  body: row.body,
  type: row.type,
  complaintId: row.complaint_id || "",
  read: Boolean(row.is_read),
  createdAt: iso(row.created_at),
});

export const upload = (row) => ({
  id: row.id,
  userId: row.user_id || "",
  filename: row.filename,
  originalName: row.original_name,
  mimeType: row.mime_type,
  sizeBytes: number(row.size_bytes),
  url: row.url,
  createdAt: iso(row.created_at),
});

export default {
  iso,
  publicUser,
  citizenVerification,
  userWithStats,
  ward,
  representative,
  complaint,
  complaintComment,
  timelineEntry,
  statusHistoryEntry,
  verificationHistoryEntry,
  officer,
  notification,
  upload,
};
