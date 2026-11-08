import { SESSION_KEYS } from "../shared/constants";

/**
 * Session storage only. Business data now lives in the shared service
 * (`utils/api.js`), so signing out must never wipe complaints or accounts.
 */

export const getToken = () => {
  try {
    return window.localStorage.getItem(SESSION_KEYS.token);
  } catch {
    return null;
  }
};

export const getUser = () => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setSession = ({ token, user }) => {
  window.localStorage.setItem(SESSION_KEYS.token, token);
  window.localStorage.setItem(SESSION_KEYS.user, JSON.stringify(user));
};

export const clearSession = () => {
  window.localStorage.removeItem(SESSION_KEYS.token);
  window.localStorage.removeItem(SESSION_KEYS.user);
};

/** Kept for existing call sites that only clear the session. */
export const clearStorage = clearSession;
