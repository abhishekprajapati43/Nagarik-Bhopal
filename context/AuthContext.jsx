import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ROLES } from "../shared/constants";
import { messageFor } from "../shared/errors";
import { decodeJwt } from "../shared/jwt";
import { call } from "../utils/api";
import { clearSession, getUser, getToken, setSession } from "../utils/storage";

const AuthContext = createContext(null);

const isExpired = (token) => {
  const claims = decodeJwt(token);
  return !claims?.exp || claims.exp * 1000 <= Date.now();
};

const restoreSession = () => {
  const token = getToken();
  const user = getUser();

  if (!token || !user || isExpired(token)) {
    clearSession();
    return { token: null, user: null };
  }

  return { token, user };
};

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(restoreSession);

  // Confirm the restored token with the service (catches expired, deleted or
  // blocked accounts) instead of trusting the copy in localStorage.
  useEffect(() => {
    if (!session.token) return undefined;

    let cancelled = false;

    call("me", { token: session.token })
      .then(({ user }) => {
        if (cancelled) return;
        setSession({ token: session.token, user });
        setSessionState({ token: session.token, user });
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setSessionState({ token: null, user: null });
      });

    return () => {
      cancelled = true;
    };
    // Only the stored token identifies the session we want to check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const startSession = useCallback(({ token, user }) => {
    setSession({ token, user });
    setSessionState({ token, user });
  }, []);

  const signIn = useCallback(
    async (credentials, { admin = false } = {}) => {
      try {
        const result = await call(admin ? "adminLogin" : "login", credentials);
        startSession(result);
        return { ok: true, user: result.user };
      } catch (error) {
        return { ok: false, message: messageFor(error) };
      }
    },
    [startSession]
  );

  const login = useCallback((credentials) => signIn(credentials), [signIn]);
  const adminLogin = useCallback((credentials) => signIn(credentials, { admin: true }), [signIn]);

  const register = useCallback(
    async (payload) => {
      try {
        const result = await call("register", payload);
        startSession(result);
        return { ok: true, user: result.user };
      } catch (error) {
        return { ok: false, message: messageFor(error) };
      }
    },
    [startSession]
  );

  const logout = useCallback(() => {
    clearSession();
    setSessionState({ token: null, user: null });
  }, []);

  const updateProfile = useCallback(
    async (payload) => {
      try {
        const result = await call("updateProfile", payload);
        setSession({ token: session.token, user: result.user });
        setSessionState({ token: session.token, user: result.user });
        return { ok: true, message: result.message };
      } catch (error) {
        return { ok: false, message: messageFor(error) };
      }
    },
    [session.token]
  );

  const value = useMemo(
    () => ({
      user: session.user,
      token: session.token,
      isAuthenticated: Boolean(session.user),
      isAdmin: session.user?.role === ROLES.ADMIN,
      login,
      adminLogin,
      register,
      logout,
      updateProfile,
    }),
    [session, login, adminLogin, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
