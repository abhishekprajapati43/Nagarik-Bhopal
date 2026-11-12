/**
 * Tiny live-update bus.
 *
 * Every successful write through `utils/api.js` publishes an event. Screens
 * that use `useService` subscribe automatically and refresh their data, so a
 * status change made in the officer console appears on the citizen's complaint
 * page without a manual reload. A storage ping extends the same behaviour to
 * other browser tabs on the device.
 */

const CHANNEL = "nagarik:live";
const listeners = new Set();

const isBrowser = typeof window !== "undefined";

export function emitLive(method = "update") {
  const detail = { method, at: Date.now() };

  for (const listener of listeners) {
    try {
      listener(detail);
    } catch {
      /* A broken listener must never break the write that triggered it. */
    }
  }

  if (!isBrowser) return;

  try {
    window.localStorage.setItem(CHANNEL, JSON.stringify(detail));
  } catch {
    /* Private mode or a full quota: same-tab listeners already ran. */
  }
}

export function subscribeLive(listener) {
  listeners.add(listener);

  if (!isBrowser) return () => listeners.delete(listener);

  const onStorage = (event) => {
    if (event.key !== CHANNEL || !event.newValue) return;
    try {
      listener(JSON.parse(event.newValue));
    } catch {
      listener({ method: "remote", at: Date.now() });
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
