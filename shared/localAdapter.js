import { AppError, ERROR_CODES } from "./errors.js";

/**
 * localStorage adapter for the browser. Keys are namespaced so the app never
 * collides with anything else stored on this origin.
 */

const PREFIX = "nagarik:";

export function createLocalStorageAdapter(prefix = PREFIX) {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(`${prefix}${key}`);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(`${prefix}${key}`, value);
      } catch {
        // The service turns this into a friendly "storage full" message.
        throw new AppError(ERROR_CODES.STORAGE, "Local storage is unavailable in this browser.");
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(`${prefix}${key}`);
      } catch {
        /* ignore */
      }
    },
  };
}
