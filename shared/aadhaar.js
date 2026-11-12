import { AppError, ERROR_CODES } from "./errors.js";

/**
 * Browser-side Aadhaar helpers for offline (localStorage) mode.
 *
 * The same rules as the server apply: a 12-digit number is encrypted with
 * AES-256-GCM, duplicate checks use a one-way SHA-256 lookup value, and only
 * the last four digits are kept readable for masking.
 *
 * This is a demo-only key. The API server uses its own AADHAAR_ENCRYPTION_KEY
 * and AADHAAR_LOOKUP_KEY, so ciphertext never moves between the two modes.
 */

const DEVICE_SECRET = "nagarik-bhopal-aadhaar-device-key-v1";
const VERSION = "v1";
const encoder = new TextEncoder();

const webCrypto = () => {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.subtle) {
    throw new AppError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      "Aadhaar encryption is not available in this browser. Open the app over https:// or localhost, or use the city API."
    );
  }

  return cryptoApi;
};

const keyCache = new Map();

const aesKey = async () => {
  if (keyCache.has("aes")) return keyCache.get("aes");

  const cryptoApi = webCrypto();
  const material = await cryptoApi.subtle.digest(
    "SHA-256",
    encoder.encode(`${DEVICE_SECRET}:encryption`)
  );
  const key = await cryptoApi.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  keyCache.set("aes", key);
  return key;
};

const toBase64 = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const toHex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const normalizeAadhaar = (value) =>
  String(value ?? "").replace(/[\s-]/g, "");

export const isAadhaarFormat = (value) => /^\d{12}$/.test(normalizeAadhaar(value));

export const aadhaarLast4 = (value) => normalizeAadhaar(value).slice(-4);

/** The only representation the UI is allowed to render. */
export const maskAadhaar = (last4) =>
  last4 ? `XXXX XXXX ${String(last4).slice(-4)}` : "XXXX XXXX ----";

export const encryptAadhaar = async (value) => {
  const normalized = normalizeAadhaar(value);

  if (!/^\d{12}$/.test(normalized)) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Aadhaar number must contain exactly 12 digits."
    );
  }

  try {
    const cryptoApi = webCrypto();
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const cipher = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(),
      encoder.encode(normalized)
    );

    return `${VERSION}:${toBase64(iv)}:${toBase64(cipher)}`;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "Your Aadhaar number could not be encrypted. Please try again."
    );
  }
};

/** Internal helper: never called from a page or returned by an API method. */
export const decryptAadhaar = async (payload) => {
  const [version, ivValue, dataValue] = String(payload || "").split(":");

  if (version !== VERSION || !ivValue || !dataValue) {
    throw new AppError(ERROR_CODES.INTERNAL, "Stored Aadhaar data could not be read.");
  }

  try {
    const cryptoApi = webCrypto();
    const plain = await cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivValue) },
      await aesKey(),
      fromBase64(dataValue)
    );

    return new TextDecoder().decode(plain);
  } catch {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "Stored Aadhaar data could not be decrypted in this browser."
    );
  }
};

/** One-way lookup value used to reject duplicate Aadhaar registrations. */
export const hashAadhaar = async (value) => {
  const normalized = normalizeAadhaar(value);
  const cryptoApi = webCrypto();
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    encoder.encode(`${DEVICE_SECRET}:lookup:${normalized}`)
  );

  return toHex(digest);
};

export default {
  normalizeAadhaar,
  isAadhaarFormat,
  aadhaarLast4,
  maskAadhaar,
  encryptAadhaar,
  decryptAadhaar,
  hashAadhaar,
};
