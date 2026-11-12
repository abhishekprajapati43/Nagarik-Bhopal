import { AppError, ERROR_CODES } from "./errors.js";
import {
  GARBAGE_CATEGORY_ID,
  PRIORITY_LIST,
  STATUS_LIST,
  WASTE_TYPES,
  findCategoryForIssue,
  findComplaintCategory,
  findComplaintIssue,
  legacyComplaintSelection,
} from "./constants.js";

/**
 * Form + API validation that both layers share, so the browser rejects bad
 * input before it is stored and the server rejects it even if a request is
 * crafted by hand.
 */

const fail = (message) => {
  throw new AppError(ERROR_CODES.VALIDATION, message);
};

export const MAX_IMAGE_BYTES = 1_500_000;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function requiredText(value, { field, min = 2, max = 500 }) {
  const text = String(value ?? "").trim();

  if (text.length === 0) fail(`${field} is required.`);
  if (text.length < min) fail(`${field} must be at least ${min} characters.`);
  if (text.length > max) fail(`${field} must be ${max} characters or fewer.`);

  return text;
}

export function optionalText(value, { field, max = 120 }) {
  const text = String(value ?? "").trim();
  if (text.length === 0) return "";
  if (text.length > max) fail(`${field} must be ${max} characters or fewer.`);
  return text;
}

export function emailAddress(value) {
  const email = String(value ?? "").trim().toLowerCase();

  if (email.length === 0) fail("Email address is required.");
  if (!EMAIL_PATTERN.test(email)) fail("Enter a valid email address.");

  return email;
}

/** Email is optional on citizen registration and may be left blank. */
export function optionalEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();

  if (email.length === 0) return "";
  if (!EMAIL_PATTERN.test(email)) fail("Enter a valid email address.");

  return email;
}

/** Mobile is the required citizen identifier; store the formatted number. */
export function mobileNumber(value) {
  const phone = phoneNumber(value);

  if (!phone) fail("Mobile number is required.");
  if (phoneDigits(phone).length !== 10) fail("Enter a valid 10-digit mobile number.");

  return phone;
}

/** Aadhaar must be exactly 12 digits. Spaces and hyphens are ignored. */
export function aadhaarNumber(value) {
  const digits = String(value ?? "").replace(/[\s-]/g, "");

  if (!digits) fail("Aadhaar number is required.");
  if (!/^\d{12}$/.test(digits)) {
    fail("Aadhaar number must contain exactly 12 digits.");
  }

  return digits;
}

export function password(value, { field = "Password" } = {}) {
  const password = String(value ?? "");

  if (password.length < 8) fail(`${field} must be at least 8 characters.`);
  if (password.length > 72) fail(`${field} must be 72 characters or fewer.`);
  if (!/[a-z]/i.test(password)) fail(`${field} must include a letter.`);
  if (!/\d/.test(password)) fail(`${field} must include a number.`);

  return password;
}

export function phoneNumber(value) {
  const phone = String(value ?? "").trim();
  if (phone.length === 0) return "";
  if (!/^[+\d][\d\s-]{6,15}$/.test(phone)) fail("Enter a valid phone number.");
  return phone;
}

/** Last 10 digits, so "+91 98111 22334" and "9811122334" match. */
export const phoneDigits = (value) => String(value ?? "").replace(/\D/g, "").slice(-10);

/**
 * The resident sign-in form accepts either an email address or a mobile
 * number. Returns a discriminated value so the service can look up exactly
 * the right field instead of guessing.
 */
export function loginIdentifier(value) {
  const text = String(value ?? "").trim();

  if (text.length === 0) fail("Email or mobile number is required.");

  if (text.includes("@")) {
    return { type: "email", value: emailAddress(text) };
  }

  const rawDigits = text.replace(/\D/g, "");
  if (rawDigits.length < 10 || rawDigits.length > 12) {
    fail("Enter a valid email address or 10-digit mobile number.");
  }

  return { type: "phone", value: phoneDigits(text) };
}

export function oneOf(value, list, field) {
  if (!list.includes(value)) fail(`Choose a valid ${field}.`);
  return value;
}

/**
 * Resolve the category/issue pair from either the new fields or the legacy
 * `wasteType` field. The category can be omitted when it is inferable from the
 * issue type, and legacy garbage values stay valid inside the new field.
 */
const resolveComplaintSelection = ({ complaintCategory, complaintType, wasteType }) => {
  const rawCategory = String(complaintCategory ?? "").trim();
  const rawType = String(complaintType ?? "").trim();
  const rawWaste = String(wasteType ?? "").trim();

  // Backward compatibility: older clients send only `wasteType`.
  if (!rawCategory && !rawType && rawWaste) {
    const legacy = legacyComplaintSelection(rawWaste);
    if (!legacy) fail("Choose a valid waste type.");
    return legacy;
  }

  const category = rawCategory
    ? findComplaintCategory(rawCategory)
    : findCategoryForIssue(rawType);

  if (!category) fail("Choose a valid complaint category.");
  if (!rawType) fail("Choose a valid complaint type.");

  // Existing garbage sub-types (Plastic, E-Waste, …) remain accepted so old
  // records and clients keep working after the category rollout.
  if (category.id === GARBAGE_CATEGORY_ID && WASTE_TYPES.includes(rawType)) {
    return { complaintCategory: category.id, complaintType: rawType };
  }

  const type = findComplaintIssue(category.id, rawType);
  if (!type) fail(`Choose a valid ${category.label.toLowerCase()} issue.`);

  return { complaintCategory: category.id, complaintType: type };
};

export function complaintPayload(payload = {}) {
  const { complaintCategory, complaintType } = resolveComplaintSelection(payload);
  const address = requiredText(payload.address, { field: "Address / landmark", min: 5, max: 160 });
  const description = requiredText(payload.description, {
    field: "Description",
    min: 10,
    max: 600,
  });
  const priority = PRIORITY_LIST.includes(payload.priority) ? payload.priority : "Medium";

  const image = String(payload.image ?? "");
  const validImageSource =
    image.startsWith("data:image/") ||
    /^https?:\/\//.test(image) ||
    /^\/uploads\/[A-Za-z0-9._-]+$/.test(image);

  if (image && !validImageSource) {
    fail("The attached photo could not be read. Please choose the image again.");
  }
  if (image.length > MAX_IMAGE_BYTES) {
    fail("That photo is too large. Please choose an image under 1.5 MB.");
  }

  let position = null;
  if (payload.position) {
    const [latitude, longitude] = payload.position.map(Number);
    const validLatitude = Number.isFinite(latitude) && Math.abs(latitude) <= 90;
    const validLongitude = Number.isFinite(longitude) && Math.abs(longitude) <= 180;
    if (validLatitude && validLongitude) position = [latitude, longitude];
  }

  return {
    complaintCategory,
    complaintType,
    // Legacy column/client field: keep it in sync with the issue type.
    wasteType: complaintType,
    address,
    description,
    priority,
    image,
    position,
    wardId: payload.wardId ? String(payload.wardId) : "",
  };
}

export function statusValue(value) {
  return oneOf(String(value ?? ""), STATUS_LIST, "status");
}

/** Verify a before/after work photo without allowing arbitrary remote content. */
export function photoValue(value, field = "Photo") {
  const image = String(value ?? "");

  if (!image) return "";

  const validImageSource =
    image.startsWith("data:image/") ||
    /^https?:\/\//.test(image) ||
    /^\/uploads\/[A-Za-z0-9._-]+$/.test(image);

  if (!validImageSource) {
    fail(`${field} could not be read. Please choose the image again.`);
  }
  if (image.length > MAX_IMAGE_BYTES) {
    fail(`${field} is too large. Please choose an image under 1.5 MB.`);
  }

  return image;
}

export function workNotes(value) {
  const notes = String(value ?? "").trim();
  if (notes.length > 1000) fail("Work notes must be 1000 characters or fewer.");
  return notes;
}

/** Parse the citizen's closed question: has your issue been resolved? */
export function verificationDecision(value) {
  if (value === true || value === "true" || value === "yes" || value === "resolved") {
    return true;
  }
  if (value === false || value === "false" || value === "no" || value === "unresolved") {
    return false;
  }
  return fail("Choose whether the issue has been resolved.");
}

export function commentText(value) {
  return requiredText(value, { field: "Comment", min: 2, max: 500 });
}
