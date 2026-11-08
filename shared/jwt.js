import { AppError, ERROR_CODES } from "./errors.js";

/**
 * Minimal HS256 JWT implementation on top of Web Crypto.
 * It runs unchanged in the browser and in Node 18+, so the offline app and the
 * Express API produce and check the same tokens without extra dependencies.
 */

const encoder = new TextEncoder();

const toBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value) => {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const importKey = (secret) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

const nowInSeconds = () => Math.floor(Date.now() / 1000);

export async function signJwt(payload, secret, ttlSeconds = 60 * 60 * 12) {
  if (!secret) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "The server is not configured to issue tokens.");

  const issuedAt = nowInSeconds();
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };

  const encodedHeader = toBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedBody = toBase64Url(encoder.encode(JSON.stringify(body)));
  const signingInput = `${encodedHeader}.${encodedBody}`;

  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const encodedSignature = toBase64Url(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}

export async function verifyJwt(token, secret) {
  if (!token || typeof token !== "string") {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Please sign in to continue.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
  }

  const [encodedHeader, encodedBody, encodedSignature] = parts;

  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedHeader)));
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
  }

  // Only the algorithm we issue is accepted, so a tampered header cannot downgrade it.
  if (header?.alg !== "HS256") {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
  }

  if (!secret) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "The server is not configured to verify tokens.");
  }

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedBody}`)
  );

  if (!valid) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedBody)));
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session is invalid. Please sign in again.");
  }

  if (typeof payload?.exp === "number" && payload.exp <= nowInSeconds()) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Your session expired. Please sign in again.");
  }

  return payload;
}

/** Read claims without checking the signature — for optimistic UI only. */
export function decodeJwt(token) {
  try {
    const [, encodedBody] = String(token).split(".");
    return JSON.parse(new TextDecoder().decode(fromBase64Url(encodedBody)));
  } catch {
    return null;
  }
}
