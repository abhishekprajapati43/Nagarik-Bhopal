/**
 * Domain constants shared by the browser app and the Express API.
 * Keeping the vocabulary in one place stops the UI, the store and the docs
 * from drifting apart.
 */

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  OFFICER: "officer",
};

/** Roles that operate the staff consoles instead of the resident portal. */
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.OFFICER];

export const USER_STATUS = {
  ACTIVE: "active",
  BLOCKED: "blocked",
};

export const STATUS = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In-Progress",
  RESOLVED: "Resolved",
  CITIZEN_VERIFICATION: "Citizen Verification",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  REJECTED: "Rejected",
};

export const STATUS_LIST = Object.values(STATUS);

/** Statuses an officer may move a complaint into from the officer console. */
export const OFFICER_STATUS_LIST = [
  STATUS.ASSIGNED,
  STATUS.IN_PROGRESS,
  STATUS.RESOLVED,
  STATUS.CITIZEN_VERIFICATION,
  STATUS.CLOSED,
  STATUS.REOPENED,
];

/**
 * Citizen verification state of a resolved complaint. `Resolved` is the
 * officer's work-complete state; the citizen then confirms it (`verified`) or
 * sends it back for another attempt (`reopened`).
 */
export const VERIFICATION_STATUS = {
  NOT_REQUESTED: "not_requested",
  PENDING: "pending",
  VERIFIED: "verified",
  REOPENED: "reopened",
};

export const VERIFICATION_STATUS_LIST = Object.values(VERIFICATION_STATUS);

/**
 * Aadhaar identity verification state of a resident account. Distinct from the
 * complaint verification flow above: this one belongs to the user record.
 */
export const AADHAAR_STATUS = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const AADHAAR_STATUS_LIST = Object.values(AADHAAR_STATUS);

/** Statuses counted as work still waiting to be picked up. */
export const PENDING_STATUSES = [STATUS.PENDING, STATUS.ACCEPTED, STATUS.ASSIGNED];
/** Statuses counted as active field work. */
export const ACTIVE_WORK_STATUSES = [STATUS.IN_PROGRESS, STATUS.REOPENED];
/** Statuses counted as the officer's work being complete. */
export const RESOLVED_STATUSES = [
  STATUS.RESOLVED,
  STATUS.CITIZEN_VERIFICATION,
  STATUS.CLOSED,
];

export const PRIORITY_LIST = ["Low", "Medium", "High"];

/**
 * Legacy garbage sub-types. Kept so existing complaints, stored data and older
 * clients that send `wasteType` continue to work unchanged.
 */
export const WASTE_TYPES = [
  "Plastic",
  "Mixed Waste",
  "Wet Waste",
  "Dry Waste",
  "Construction Waste",
  "Dead Animal",
  "E-Waste",
];

export const GARBAGE_CATEGORY_ID = "garbage-collection";
export const OTHER_CATEGORY_ID = "other";

/**
 * The single source of truth for civic complaint categories and their issues.
 * `id` is stored in the database; `label` and `issues` are shown in the UI.
 */
export const COMPLAINT_CATEGORIES = [
  {
    id: "road",
    label: "Road Complaint",
    issues: [
      "Potholes",
      "Broken Roads",
      "Damaged Footpaths",
      "Broken Dividers",
      "Unsafe Road Surface",
    ],
  },
  {
    id: "water-supply",
    label: "Water Supply",
    issues: [
      "Water Leakage",
      "Low Water Pressure",
      "No Water Supply",
      "Contaminated Water",
    ],
  },
  {
    id: "electricity",
    label: "Electricity",
    issues: [
      "Power Outage",
      "Damaged Electric Pole",
      "Hanging Wires",
      "Unsafe Electric Equipment",
    ],
  },
  {
    id: "street-light",
    label: "Street Light",
    issues: [
      "Street Light Not Working",
      "Flickering Street Light",
      "Light Always ON",
      "Light Always OFF",
    ],
  },
  {
    id: GARBAGE_CATEGORY_ID,
    label: "Garbage Collection",
    issues: [
      "Overflowing Dustbin",
      "Missed Garbage Collection",
      "Illegal Garbage Dumping",
      "Waste on Road",
    ],
  },
  {
    id: "drainage",
    label: "Drainage",
    issues: ["Blocked Drain", "Open Manhole", "Waterlogging", "Sewer Overflow"],
  },
  {
    id: "public-property-damage",
    label: "Public Property Damage",
    issues: [
      "Broken Bench",
      "Park Damage",
      "Damaged Bus Stop",
      "Broken Sign Board",
      "Government Property Damage",
    ],
  },
  {
    id: OTHER_CATEGORY_ID,
    label: "Other Civic Issues",
    issues: ["Other Civic Issue"],
  },
];

const normaliseOption = (value) => String(value ?? "").trim().toLowerCase();

/** Find a category by stable id or display label. */
export function findComplaintCategory(value) {
  const needle = normaliseOption(value);
  if (!needle) return null;

  return (
    COMPLAINT_CATEGORIES.find(
      (category) =>
        category.id === needle || normaliseOption(category.label) === needle
    ) || null
  );
}

export function complaintCategoryLabel(categoryId) {
  return findComplaintCategory(categoryId)?.label || "Civic Issue";
}

export function complaintIssueOptions(categoryId) {
  return findComplaintCategory(categoryId)?.issues || [];
}

/** Match an issue label case-insensitively and return its canonical label. */
export function findComplaintIssue(categoryId, value) {
  const category = findComplaintCategory(categoryId);
  if (!category) return "";

  const needle = normaliseOption(value);
  return category.issues.find((issue) => normaliseOption(issue) === needle) || "";
}

/** Infer the category when an API client sends only an issue type. */
export function findCategoryForIssue(value) {
  const needle = normaliseOption(value);
  if (!needle) return null;

  return (
    COMPLAINT_CATEGORIES.find((category) =>
      category.issues.some((issue) => normaliseOption(issue) === needle)
    ) || null
  );
}

/** Map a legacy garbage `wasteType` to the new category/type pair. */
export function legacyComplaintSelection(wasteType) {
  const type = String(wasteType ?? "").trim();
  if (!WASTE_TYPES.includes(type)) return null;
  return { complaintCategory: GARBAGE_CATEGORY_ID, complaintType: type };
}

/**
 * CSS hook for a status name: "In-Progress" -> "in-progress".
 * ComplaintCard.css already styles .pending / .in-progress / .resolved.
 */
export const statusClass = (status) =>
  String(status || "Pending").toLowerCase().replace(/\s+/g, "-");

export const SESSION_KEYS = {
  token: "token",
  user: "user",
};

/** Fallback secret for the offline (Live Server) mode. Overridden on the server. */
export const DEMO_JWT_SECRET = "nagarik-bhopal-demo-secret-change-me";

export const TOKEN_TTL_SECONDS = {
  [ROLES.USER]: 60 * 60 * 12,
  [ROLES.ADMIN]: 60 * 60 * 8,
  [ROLES.OFFICER]: 60 * 60 * 8,
};

/** Seeded administrator so a fresh install can open the admin panel. */
export const DEMO_ADMIN = {
  name: "City Administrator",
  email: "admin@nagarik.bhopal",
  password: "Admin@123",
};

/** Seeded sanitation officer so the officer console can be demonstrated. */
export const DEMO_OFFICER = {
  name: "Kavita Yadav",
  email: "officer@nagarik.bhopal",
  password: "Officer@123",
  employeeCode: "SO-1042",
  zone: "South",
  phone: "+91 91111 44556",
};

export const DEFAULT_SETTINGS = {
  cityName: "Bhopal",
  department: "Bhopal Municipal Corporation",
  supportEmail: "care@nagarik.bhopal",
  slaDays: 3,
  autoAssignWard: true,
  allowRegistration: true,
  notifyOnNewComplaint: true,
  emailNotifications: true,
  emailTemplates: {},
};

/**
 * Editable email bodies. Placeholders use {{name}} syntax and are replaced by
 * the email service. Administrators can override any of them in Settings.
 */
export const EMAIL_TEMPLATES = {
  complaintSubmitted: {
    subject: "Complaint {{code}} received",
    body:
      "Hello {{citizenName}},\n\nWe received your complaint {{code}} about {{issue}} at {{address}}. " +
      "Current status: {{status}}.\n\nYou can follow the progress in your Nagarik dashboard.\n\n{{city}} Civic Team",
  },
  complaintAccepted: {
    subject: "Complaint {{code}} accepted",
    body:
      "Hello {{citizenName}},\n\nYour complaint {{code}} ({{issue}}) has been accepted by the ward team. " +
      "We will keep you updated as work progresses.\n\n{{city}} Civic Team",
  },
  officerAssigned: {
    subject: "Complaint {{code}} assigned to {{officerName}}",
    body:
      "Hello {{citizenName}},\n\nComplaint {{code}} at {{address}} has been assigned to sanitation officer " +
      "{{officerName}}. Current status: {{status}}.\n\n{{city}} Civic Team",
  },
  workStarted: {
    subject: "Work started on complaint {{code}}",
    body:
      "Hello {{citizenName}},\n\nSanitation work has started on complaint {{code}} at {{address}}. " +
      "You will be asked to verify the fix once it is marked resolved.\n\n{{city}} Civic Team",
  },
  complaintResolved: {
    subject: "Complaint {{code}} marked resolved",
    body:
      "Hello {{citizenName}},\n\nComplaint {{code}} at {{address}} has been marked resolved. " +
      "Please open the complaint and answer: Has your issue been resolved?\n\n{{city}} Civic Team",
  },
  complaintClosed: {
    subject: "Complaint {{code}} closed",
    body:
      "Hello {{citizenName}},\n\nThank you for confirming the fix. Complaint {{code}} is now closed.\n\n{{city}} Civic Team",
  },
  complaintReopened: {
    subject: "Complaint {{code}} reopened",
    body:
      "Hello {{citizenName}},\n\nComplaint {{code}} at {{address}} has been reopened after citizen verification. " +
      "The ward team has been alerted.\n\n{{city}} Civic Team",
  },
};

/** Languages shipped with the app. Add a dictionary entry to add another. */
export const LANGUAGES = [
  { id: "en", label: "English", short: "EN" },
  { id: "hi", label: "हिन्दी", short: "हिं" },
];

/** Ward master data with map centres, used for GPS auto-assignment. */
export const WARDS = [
  { id: "ward-07", name: "Ward 07", area: "Bairagarh", zone: "West", center: [23.2804, 77.3312], assignedOfficerId: "" },
  { id: "ward-12", name: "Ward 12", area: "Ashoka Garden", zone: "North", center: [23.25, 77.46], assignedOfficerId: "" },
  { id: "ward-18", name: "Ward 18", area: "Shahpura", zone: "East", center: [23.2005, 77.4302], assignedOfficerId: "" },
  { id: "ward-25", name: "Ward 25", area: "Kolar", zone: "South", center: [23.1803, 77.4204], assignedOfficerId: "officer-1" },
  { id: "ward-35", name: "Ward 35", area: "MP Nagar", zone: "Central", center: [23.2599, 77.4126], assignedOfficerId: "officer-1" },
  { id: "ward-40", name: "Ward 40", area: "New Market", zone: "Central", center: [23.2335, 77.4345], assignedOfficerId: "officer-1" },
  { id: "ward-44", name: "Ward 44", area: "Govindpura", zone: "North", center: [23.2712, 77.4402], assignedOfficerId: "" },
  { id: "ward-52", name: "Ward 52", area: "Ayodhya Bypass", zone: "East", center: [23.2704, 77.4891], assignedOfficerId: "" },
];

/** Nearest ward centre to a pair of coordinates (simple, dependency-free). */
export function findNearestWard(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  let closest = null;
  let best = Number.POSITIVE_INFINITY;

  for (const ward of WARDS) {
    const [lat, lng] = ward.center;
    const distance = (lat - latitude) ** 2 + (lng - longitude) ** 2;

    if (distance < best) {
      best = distance;
      closest = ward;
    }
  }

  return closest;
}
