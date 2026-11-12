import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { useAuth } from "../../context/AuthContext";
import { initials } from "../../utils/format";
import "./admin.css";

const LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/citizen-verification", label: "Citizen Verification" },
  { to: "/admin/wards", label: "Wards" },
  { to: "/admin/representatives", label: "Representatives" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-shell console-shell">
      <header className="console-header">
        <div className="console-header-inner">
          <Link className="console-brand" to="/admin" aria-label="Nagarik admin console">
            <span className="brand-mark">N</span>
            <span>
              NAGARIK
              <small>ADMIN CONSOLE</small>
            </span>
          </Link>

          <nav className="console-nav" aria-label="Admin sections">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="console-actions">
            <Link className="console-public" to="/">Public site</Link>

            <LanguageSwitcher compact />

            <span className="console-user">
              <span className="admin-avatar" aria-hidden="true">{initials(user?.name)}</span>
              <span>
                <b>{user?.name}</b>
                <small>{user?.role === "admin" ? "Administrator" : "Staff"}</small>
              </span>
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
        </div>
      </header>

      <div className="admin-main">
        <div className="console-page-head">
          <h1>City Operations</h1>
          <small>Complaints, wards and residents of Bhopal</small>
        </div>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
