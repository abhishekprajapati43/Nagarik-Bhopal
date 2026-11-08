/**
 * Password hashing with PBKDF2-SHA256 through Web Crypto.
 * Works in the browser (offline mode) and in Node, and never stores plain text.
 */

const ITERATIONS = 120_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

const toBase64 = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const derive = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_LENGTH_BITS
  );

  return new Uint8Array(bits);
};

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

const constantTimeEquals = (left, right) => {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
};

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;

  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;

  const derived = await derive(password, fromBase64(salt), Number(iterations));
  return constantTimeEquals(derived, fromBase64(hash));
}
