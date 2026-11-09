import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { initials } from "../../utils/format";
import "../admin/admin.css";
import "./user.css";

/**
 * Resident workspace. It deliberately reuses the administrator shell classes
 * from admin.css so both dashboards share the same spacing, colours, cards and
 * responsive behaviour without touching the admin console itself.
 */
const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "▦", end: true },
  { to: "/report", label: "Register Complaint", icon: "📝" },
  { to: "/my-complaints", label: "My Complaints", icon: "🗑" },
  { to: "/complaint-status", label: "Complaint Status", icon: "◷" },
  { to: "/notifications", label: "Notifications", icon: "🔔" },
  { to: "/profile", label: "Profile", icon: "👤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

const HEADINGS = {
  "/dashboard": ["My Dashboard", "Your reports and city updates at a glance"],
  "/report": ["Register a Complaint", "Tell the city team what needs attention"],
  "/my-complaints": ["My Complaints", "Every issue you have reported"],
  "/complaint-status": ["Complaint Status", "Track how your reports are progressing"],
  "/notifications": ["Notifications", "Updates about your reports and announcements"],
  "/profile": ["Profile", "Your account and contact details"],
  "/settings": ["Settings", "Account preferences and password"],
};

const normalise = (pathname) => pathname.replace(/\/+$/, "") || "/";

export default function UserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPath = normalise(pathname);
  const isComplaintDetail = currentPath.startsWith("/complaint/");
  const [title, subtitle] =
    HEADINGS[currentPath] ||
    (isComplaintDetail
      ? ["Complaint Details", "Full details of this civic report"]
      : HEADINGS["/dashboard"]);

  // Signing out clears the stored token and user, then returns to the public
  // home page. Route guards keep dashboard pages closed if the visitor uses
  // the browser Back button afterwards.
  const signOut = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="admin-shell user-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/">
          <span className="brand-mark">N</span>
          <span>
            NAGARIK
            <small>RESIDENT PORTAL</small>
          </span>
        </Link>

        <nav className="admin-nav">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              <span className="admin-nav-icon" aria-hidden="true">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer user-sidebar-footer">
          <Link to="/">← Back to public site</Link>
          <span>Signed in as {user?.email}</span>

          {/* Pinned to the bottom of the resident sidebar on desktop. */}
          <button
            type="button"
            className="user-logout"
            onClick={signOut}
            title="Log out"
            aria-label="Log out"
          >
            <span className="user-logout-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            Logout
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>{title}</h1>
            <small>{subtitle}</small>
          </div>

          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">{initials(user?.name)}</span>
            <span>
              <b>{user?.name}</b>
              <br />
              <small>Resident</small>
            </span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
