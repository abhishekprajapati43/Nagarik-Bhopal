import { createContext, useContext, useState } from "react";
import { clearStorage, getUser, getToken } from "../utils/storage";

const AuthContext = createContext(null);
const USERS_KEY = "nagarik-users";

const readUsers = () => {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
};

export function AuthProvider({ children }) {
  // Restore the session on reload, otherwise the header forgets the user.
  const [user, setUser] = useState(() => getUser());

  const register = ({ name, email, password }) => {
    const users = readUsers();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (users.some((person) => String(person.email).toLowerCase() === normalizedEmail)) {
      return { ok: false, message: "An account with this email already exists on this device." };
    }

    users.push({ name: String(name).trim(), email: normalizedEmail, password });
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    return { ok: true, message: "Your demo account is ready on this device. You can sign in now." };
  };

  const login = ({ email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase();
    const match = readUsers().find(
      (person) => String(person.email).toLowerCase() === normalizedEmail
    );

    if (!match) {
      return {
        ok: false,
        message: "We couldn’t find an account for that email on this device. Create an account to continue.",
      };
    }

    if (match.password !== password) {
      return { ok: false, message: "That password doesn’t match this account." };
    }

    const sessionUser = { name: match.name, email: match.email };
    localStorage.setItem("user", JSON.stringify(sessionUser));
    localStorage.setItem("token", `demo-${Date.now()}`);
    setUser(sessionUser);

    return { ok: true, user: sessionUser };
  };

  const logout = () => {
    clearStorage();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token: getToken(), login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
