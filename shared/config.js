import { DEMO_JWT_SECRET } from "./constants.js";

/**
 * Runtime configuration for the web client.
 *
 * By default the app is self-contained: it runs the shared domain against
 * localStorage, which is what makes `index.html` + Live Server work with no
 * server at all.
 *
 * Set USE_REMOTE_API to true (and run `npm start`) to talk to the Express API
 * instead. The server mints and verifies JWTs with JWT_SECRET from .env, so in
 * that mode roles are enforced server-side rather than in the browser.
 */
export const USE_REMOTE_API = false;

/** Same origin by default; point it at http://localhost:5000 for Live Server + API. */
export const API_BASE_URL = "";

export const CLIENT_CONFIG = {
  appName: "Nagarik Bhopal",
  demoJwtSecret: DEMO_JWT_SECRET,
  useRemoteApi: USE_REMOTE_API,
};
