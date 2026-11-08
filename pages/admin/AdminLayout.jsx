import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { initials } from "../../utils/format";
import "./admin.css";

const LINKS = [
  { to: "/admin", label: "Dashboard", icon: "▦", end: true },
  { to: "/admin/complaints", label: "Complaints", icon: "🗑" },
  { to: "/admin/users", label: "Users", icon: "👥" },
  { to: "/admin/wards", label: "Wards", icon: "🗺" },
  { to: "/admin/representatives", label: "Representatives", icon: "🏛" },
  { to: "/admin/analytics", label: "Analytics", icon: "📊" },
  { to: "/admin/reports", label: "Reports", icon: "📄" },
  { to: "/admin/notifications", label: "Notifications", icon: "🔔" },
  { to: "/admin/settings", label: "Settings", icon: "⚙" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          <span className="brand-mark">N</span>
          <span>
            NAGARIK
            <small>ADMIN CONSOLE</small>
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

        <div className="admin-sidebar-footer">
          <Link to="/">← Back to public site</Link>
          <span>Signed in as {user?.email}</span>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>City Operations</h1>
            <small>Complaints, wards and residents of Bhopal</small>
          </div>

          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">{initials(user?.name)}</span>
            <span>
              <b>{user?.name}</b>
              <br />
              <small>{user?.role === "admin" ? "Administrator" : "Staff"}</small>
            </span>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                logout();
                navigate("/admin/login", { replace: true });
              }}
            >
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
