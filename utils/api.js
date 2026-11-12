import { API_BASE_URL, USE_REMOTE_API } from "../shared/config";
import { DEMO_JWT_SECRET } from "../shared/constants";
import { AppError, ERROR_CODES } from "../shared/errors";
import { createLocalStorageAdapter } from "../shared/localAdapter";
import { dispatch } from "../shared/rpc";
import { createService } from "../shared/service";
import { emitLive } from "./live";
import { getToken } from "./storage";

/**
 * The single way the UI reaches data.
 *
 * Offline mode (default): the shared domain runs in the browser over
 * localStorage, which is why the static Live Server build needs no server.
 * API mode: the exact same method names are sent to POST /api/rpc, where the
 * Express server applies the same domain with JWT-verified roles.
 */

const localService = createService(createLocalStorageAdapter(), { secret: DEMO_JWT_SECRET });

/** Methods that only read data; they must not trigger a live refresh. */
const READ_METHODS = new Set([
  "me",
  "getComplaint",
  "listComplaints",
  "myStats",
  "analytics",
  "listWards",
  "getWard",
  "wardHeatmap",
  "listRepresentatives",
  "listOfficers",
  "listUsers",
  "listNotifications",
  "getSettings",
  "listEmailOutbox",
  "listCitizenVerifications",
  "listVerificationAudit",
  "officerDashboard",
  "officerProfile",
  "listOfficerComplaints",
  "getOfficerComplaint",
  "checkDuplicates",
]);

const remoteCall = async (method, args) => {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args, token: getToken() }),
    });
  } catch {
    throw new AppError(
      ERROR_CODES.UNAUTHENTICATED,
      "Cannot reach the city API. Check that the server is running."
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    throw new AppError(
      payload?.error?.code || ERROR_CODES.VALIDATION,
      payload?.error?.message || "Something went wrong. Please try again."
    );
  }

  return payload.result;
};

export const call = async (method, args = {}) => {
  const result = USE_REMOTE_API
    ? await remoteCall(method, args)
    : await dispatch(localService, method, args, getToken());

  // Reads never publish; any successful write refreshes the screens that have
  // mounted a live subscription (see hooks/useService.js).
  if (!READ_METHODS.has(method)) emitLive(method);

  return result;
};

export const dataMode = USE_REMOTE_API ? "api" : "device";
