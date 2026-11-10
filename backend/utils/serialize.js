/** Convert database rows into the exact camelCase shapes the frontend uses. */

export const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || "",
  wardId: row.ward_id || "",
  role: row.role,
  status: row.status,
  createdAt: iso(row.created_at),
});

export const userWithStats = (row) => ({
  ...publicUser(row),
  ward: row.ward_name || "Unassigned",
  complaints: number(row.complaint_count),
});

export const ward = (row) => ({
  id: row.id,
  name: row.name,
  area: row.area,
  zone: row.zone,
  center: [number(row.center_lat), number(row.center_lng)],
  representativeId: row.representative_id || "",
  representative: row.representative_name || "Not assigned",
  complaints: number(row.complaint_count),
  resolved: number(row.resolved_count),
  assigned: Boolean(row.assigned),
  createdAt: iso(row.created_at),
});

export const representative = (row) => ({
  id: row.id,
  name: row.name,
  designation: row.designation,
  phone: row.phone || "",
  email: row.email || "",
  wardId: row.ward_id || "",
  ward: row.ward_name || "Unassigned",
  complaints: number(row.complaint_count),
  createdAt: iso(row.created_at),
});

export const complaint = (row) => {
  const finished = row.status === "Resolved" || row.status === "Rejected";
  const end = finished ? new Date(row.updated_at) : new Date();
  const days = Math.max(0, Math.floor((end - new Date(row.created_at)) / 86_400_000));

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    wasteType: row.waste_type,
    description: row.description,
    address: row.address,
    wardId: row.ward_id || "",
    ward: row.ward_name || "Unassigned",
    representativeId: row.representative_id || "",
    representative: row.representative_name || "Not assigned",
    status: row.status,
    priority: row.priority,
    image: row.image || "",
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
  userWithStats,
  ward,
  representative,
  complaint,
  complaintComment,
  timelineEntry,
  notification,
  upload,
};
