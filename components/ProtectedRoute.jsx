import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const homeFor = (user) => {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "officer") return "/officer/dashboard";
  return "/dashboard";
};

const loginFor = (admin, officer) => {
  if (officer) return "/officer/login";
  if (admin) return "/admin/login";
  return "/login";
};

/**
 * Route guard for the three separate sign-in flows.
 * Residents are sent to /login, administrators to /admin/login and sanitation
 * officers to /officer/login. A signed-in account that tries another console
 * is bounced back to the dashboard that belongs to its role.
 */
export default function ProtectedRoute({
  children,
  admin = false,
  officer = false,
  resident = false,
}) {
  const { user, isAdmin, isOfficer } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={loginFor(admin, officer)}
        replace
        state={{
          from: location.pathname,
          message: officer
            ? "Sign in with a sanitation officer account to open the officer console."
            : admin
              ? "Sign in with an administrator account to open the admin panel."
              : "Please sign in to continue.",
        }}
      />
    );
  }

  if (admin && !isAdmin) {
    return (
      <Navigate
        to={homeFor(user)}
        replace
        state={{ message: "The admin panel is only available to city administrators." }}
      />
    );
  }

  if (officer && !isOfficer) {
    return (
      <Navigate
        to={homeFor(user)}
        replace
        state={{ message: "The officer console is only available to sanitation officers." }}
      />
    );
  }

  // Staff have their own consoles, so the resident-only workspace sends them
  // back there instead of rendering a second dashboard.
  if (resident && (isAdmin || isOfficer)) {
    return (
      <Navigate
        to={homeFor(user)}
        replace
        state={{ message: "The resident dashboard is only available to resident accounts." }}
      />
    );
  }

  return children;
}
