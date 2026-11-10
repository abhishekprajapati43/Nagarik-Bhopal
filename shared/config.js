import { DEMO_JWT_SECRET } from "./constants.js";

/**
 * Runtime configuration for the web client.
 *
 * The app talks to the Express + PostgreSQL API by default. The API is served
 * by `npm start` on port 5000, and those same built files are also served by
 * Express, so a same-origin request works there.
 *
 * When index.html is opened with Live Server (port 5500/5501) the bundle points
 * at the API on port 5000 instead. Build with VITE_DATA_MODE=device to keep the
 * old fully offline localStorage mode, or VITE_API_URL=... to target another
 * API host.
 */
const buildEnv =
  (typeof import.meta !== "undefined" && import.meta.env) || {};

const runtime = typeof window !== "undefined" ? window.location : null;

const STATIC_DEV_PORTS = new Set(["5500", "5501", "5173", "4173", "3000", "8080"]);

export const USE_REMOTE_API = buildEnv.VITE_DATA_MODE
  ? buildEnv.VITE_DATA_MODE === "api"
  : true;

export const API_BASE_URL =
  buildEnv.VITE_API_URL !== undefined
    ? buildEnv.VITE_API_URL
    : runtime && STATIC_DEV_PORTS.has(runtime.port)
      ? `${runtime.protocol}//${runtime.hostname}:5000`
      : "";

export const CLIENT_CONFIG = {
  appName: "Nagarik Bhopal",
  demoJwtSecret: DEMO_JWT_SECRET,
  useRemoteApi: USE_REMOTE_API,
};
