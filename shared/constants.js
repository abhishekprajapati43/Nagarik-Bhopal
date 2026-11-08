/**
 * Domain constants shared by the browser app and the Express API.
 * Keeping the vocabulary in one place stops the UI, the store and the docs
 * from drifting apart.
 */

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
};

export const USER_STATUS = {
  ACTIVE: "active",
  BLOCKED: "blocked",
};

export const STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

export const STATUS_LIST = Object.values(STATUS);

export const PRIORITY_LIST = ["Low", "Medium", "High"];

export const WASTE_TYPES = [
  "Plastic",
  "Mixed Waste",
  "Wet Waste",
  "Dry Waste",
  "Construction Waste",
  "Dead Animal",
  "E-Waste",
];

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
};

/** Seeded administrator so a fresh install can open the admin panel. */
export const DEMO_ADMIN = {
  name: "City Administrator",
  email: "admin@nagarik.bhopal",
  password: "Admin@123",
};

export const DEFAULT_SETTINGS = {
  cityName: "Bhopal",
  department: "Bhopal Municipal Corporation",
  supportEmail: "care@nagarik.bhopal",
  slaDays: 3,
  autoAssignWard: true,
  allowRegistration: true,
  notifyOnNewComplaint: true,
};

/** Ward master data with map centres, used for GPS auto-assignment. */
export const WARDS = [
  { id: "ward-07", name: "Ward 07", area: "Bairagarh", zone: "West", center: [23.2804, 77.3312] },
  { id: "ward-12", name: "Ward 12", area: "Ashoka Garden", zone: "North", center: [23.25, 77.46] },
  { id: "ward-18", name: "Ward 18", area: "Shahpura", zone: "East", center: [23.2005, 77.4302] },
  { id: "ward-25", name: "Ward 25", area: "Kolar", zone: "South", center: [23.1803, 77.4204] },
  { id: "ward-35", name: "Ward 35", area: "MP Nagar", zone: "Central", center: [23.2599, 77.4126] },
  { id: "ward-40", name: "Ward 40", area: "New Market", zone: "Central", center: [23.2335, 77.4345] },
  { id: "ward-44", name: "Ward 44", area: "Govindpura", zone: "North", center: [23.2712, 77.4402] },
  { id: "ward-52", name: "Ward 52", area: "Ayodhya Bypass", zone: "East", center: [23.2704, 77.4891] },
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
