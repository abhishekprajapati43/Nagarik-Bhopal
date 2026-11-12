import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { useAuth } from "../../context/AuthContext";
import { initials } from "../../utils/format";
import "../admin/admin.css";
import "./officer.css";

const LINKS = [
  { to: "/officer/dashboard", label: "Dashboard", end: true },
  { to: "/officer/complaints", label: "Assigned Complaints" },
];

const HEADINGS = {
  "/officer/dashboard": ["Sanitation Dashboard", "Your assigned complaints at a glance"],
  "/officer/complaints": ["Assigned Complaints", "Update status, upload photos and close the work"],
};

const normalise = (pathname) => pathname.replace(/\/+$/, "") || "/";

/** Officer workspace sharing the same header-first shell as the admin console. */
export default function OfficerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [title, subtitle] =
    HEADINGS[normalise(pathname)] || HEADINGS["/officer/dashboard"];

  const signOut = () => {
    logout();
    navigate("/officer/login", { replace: true });
  };

  return (
    <div className="admin-shell console-shell officer-shell">
      <header className="console-header">
        <div className="console-header-inner">
          <Link
            className="console-brand"
            to="/officer/dashboard"
            aria-label="Nagarik officer console"
          >
            <span className="brand-mark">N</span>
            <span>
              NAGARIK
              <small>OFFICER CONSOLE</small>
            </span>
          </Link>

          <nav className="console-nav" aria-label="Officer sections">
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
                <small>Sanitation Officer</small>
              </span>
            </span>

            <button type="button" className="small-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="admin-main">
        <div className="console-page-head">
          <h1>{title}</h1>
          <small>{subtitle}</small>
        </div>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
