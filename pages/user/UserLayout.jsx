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
  const [title, subtitle] = HEADINGS[normalise(pathname)] || HEADINGS["/dashboard"];

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="admin-shell user-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/home">
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

          <button type="button" className="admin-nav-signout" onClick={signOut}>
            <span className="admin-nav-icon" aria-hidden="true">⎋</span>
            Logout
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/home">← Back to public site</Link>
          <span>Signed in as {user?.email}</span>
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
            <button type="button" className="small-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
