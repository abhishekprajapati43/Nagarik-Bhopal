import crypto from "node:crypto";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { env } from "../config/env.js";

/**
 * Aadhaar storage helpers.
 *
 * - The 12-digit number is encrypted with AES-256-GCM before it is written to
 *   Postgres. The ciphertext is versioned so the format can change later.
 * - Duplicate checks use a keyed HMAC hash, never the plain number.
 * - Only the last four digits are kept in a separate readable column for
 *   masking (`XXXX XXXX 1234`).
 *
 * Keys come from AADHAAR_ENCRYPTION_KEY / AADHAAR_LOOKUP_KEY. When those are
 * absent the service derives stable keys from JWT_SECRET so a demo install
 * still boots; production should set dedicated secrets.
 */

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

const deriveKey = (purpose, configured) =>
  crypto
    .createHash("sha256")
    .update(`nagarik:aadhaar:${purpose}:${configured || env.jwtSecret}`)
    .digest();

const encryptionKey = () => deriveKey("encryption", env.aadhaar.encryptionKey);
const lookupKey = () =>
  deriveKey("lookup", env.aadhaar.lookupKey || env.aadhaar.encryptionKey);

/** Strip the usual spaces/hyphens so "1234 5678 9012" and "123456789012" match. */
export const normalizeAadhaar = (value) =>
  String(value ?? "").replace(/[\s-]/g, "");

export const isAadhaarFormat = (value) => /^\d{12}$/.test(normalizeAadhaar(value));

export const aadhaarLast4 = (value) => normalizeAadhaar(value).slice(-4);

/** The only representation the API is allowed to return. */
export const maskAadhaar = (last4) =>
  last4 ? `XXXX XXXX ${String(last4).slice(-4)}` : "XXXX XXXX ----";

export const encryptAadhaar = (value) => {
  const normalized = normalizeAadhaar(value);

  if (!/^\d{12}$/.test(normalized)) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Aadhaar number must contain exactly 12 digits."
    );
  }

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(CIPHER, encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  } catch {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "Your Aadhaar number could not be encrypted. Please try again."
    );
  }
};

/** Internal helper: decryption is never exposed through an API response. */
export const decryptAadhaar = (payload) => {
  const [version, ivValue, tagValue, dataValue] = String(payload || "").split(":");

  if (version !== VERSION || !ivValue || !tagValue || !dataValue) {
    throw new AppError(ERROR_CODES.INTERNAL, "Stored Aadhaar data could not be read.");
  }

  try {
    const decipher = crypto.createDecipheriv(
      CIPHER,
      encryptionKey(),
      Buffer.from(ivValue, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataValue, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "Stored Aadhaar data could not be decrypted with the configured key."
    );
  }
};

/** One-way lookup value used to reject duplicate Aadhaar registrations. */
export const hashAadhaar = (value) =>
  crypto
    .createHmac("sha256", lookupKey())
    .update(normalizeAadhaar(value))
    .digest("hex");

export default {
  normalizeAadhaar,
  isAadhaarFormat,
  aadhaarLast4,
  maskAadhaar,
  encryptAadhaar,
  decryptAadhaar,
  hashAadhaar,
};
