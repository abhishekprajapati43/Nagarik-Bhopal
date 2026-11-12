import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { initials } from "../../utils/format";
import "../admin/admin.css";
import "./user.css";

/**
 * Resident workspace. It uses the same header-first shell as the admin and
 * officer consoles (and the public home page): the section links sit in a
 * sticky top header instead of a left sidebar. Spacing, colours, cards and
 * tables still come from admin.css.
 */
const LINKS = [
  { to: "/dashboard", key: "user.dashboard", icon: "▦", end: true },
  { to: "/report", key: "user.registerComplaint", icon: "📝" },
  { to: "/my-complaints", key: "user.myComplaints", icon: "🗑" },
  { to: "/complaint-status", key: "user.complaintStatus", icon: "◷" },
  { to: "/notifications", key: "user.notifications", icon: "🔔" },
  { to: "/profile", key: "user.profile", icon: "👤" },
  { to: "/settings", key: "user.settings", icon: "⚙" },
];

const HEADINGS = {
  "/dashboard": ["user.dashboard", "Your reports and city updates at a glance"],
  "/report": ["user.registerComplaint", "Tell the city team what needs attention"],
  "/my-complaints": ["user.myComplaints", "Every issue you have reported"],
  "/complaint-status": ["user.complaintStatus", "Track how your reports are progressing"],
  "/notifications": ["user.notifications", "Updates about your reports and announcements"],
  "/profile": ["user.profile", "Your account and contact details"],
  "/settings": ["user.settings", "Account preferences and password"],
};

const normalise = (pathname) => pathname.replace(/\/+$/, "") || "/";

export default function UserLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPath = normalise(pathname);
  const isComplaintDetail = currentPath.startsWith("/complaint/");
  const [titleKey, subtitle] =
    HEADINGS[currentPath] ||
    (isComplaintDetail
      ? ["details.title", "Full details of this civic report"]
      : HEADINGS["/dashboard"]);
  const title = t(titleKey);

  // Signing out clears the stored token and user, then returns to the public
  // home page. Route guards keep dashboard pages closed if the visitor uses
  // the browser Back button afterwards.
  const signOut = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="admin-shell console-shell user-shell">
      <header className="console-header">
        <div className="console-header-inner">
          <Link className="console-brand" to="/" aria-label="Nagarik resident portal">
            <span className="brand-mark">N</span>
            <span>
              NAGARIK
              <small>RESIDENT PORTAL</small>
            </span>
          </Link>

          <nav className="console-nav" aria-label="Resident sections">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                <span className="user-nav-icon" aria-hidden="true">{link.icon}</span>
                {t(link.key)}
              </NavLink>
            ))}
          </nav>

          <div className="console-actions">
            <Link className="console-public" to="/">
              Public site
            </Link>

            <LanguageSwitcher compact />

            <span className="console-user">
              <span className="admin-avatar" aria-hidden="true">{initials(user?.name)}</span>
              <span>
                <b>{user?.name}</b>
                <small>{t("user.resident")}</small>
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
