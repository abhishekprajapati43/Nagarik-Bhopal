import { AppError, ERROR_CODES } from "./errors.js";
import { PRIORITY_LIST, STATUS_LIST, WASTE_TYPES } from "./constants.js";

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

export function complaintPayload(payload = {}) {
  const wasteType = oneOf(String(payload.wasteType ?? "").trim(), WASTE_TYPES, "waste type");
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
    wasteType,
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

export function commentText(value) {
  return requiredText(value, { field: "Comment", min: 2, max: 500 });
}
