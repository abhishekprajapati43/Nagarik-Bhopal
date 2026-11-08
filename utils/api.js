import { API_BASE_URL, USE_REMOTE_API } from "../shared/config";
import { DEMO_JWT_SECRET } from "../shared/constants";
import { AppError, ERROR_CODES } from "../shared/errors";
import { createLocalStorageAdapter } from "../shared/localAdapter";
import { dispatch } from "../shared/rpc";
import { createService } from "../shared/service";
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

export const call = (method, args = {}) =>
  USE_REMOTE_API ? remoteCall(method, args) : dispatch(localService, method, args, getToken());

export const dataMode = USE_REMOTE_API ? "api" : "device";
