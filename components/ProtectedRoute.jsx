import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Route guard for the two separate sign-in flows.
 * Residents are sent to /login, administrators to /admin/login, and a resident
 * who tries an /admin route is bounced back to their own dashboard.
 */
export default function ProtectedRoute({ children, admin = false, resident = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={admin ? "/admin/login" : "/login"}
        replace
        state={{
          from: location.pathname,
          message: admin
            ? "Sign in with an administrator account to open the admin panel."
            : "Please sign in to continue.",
        }}
      />
    );
  }

  if (admin && !isAdmin) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ message: "The admin panel is only available to city administrators." }}
      />
    );
  }

  // Administrators have their own console, so the resident-only workspace
  // sends them back there instead of rendering a second dashboard.
  if (resident && isAdmin) {
    return (
      <Navigate
        to="/admin"
        replace
        state={{ message: "The resident dashboard is only available to resident accounts." }}
      />
    );
  }

  return children;
}
