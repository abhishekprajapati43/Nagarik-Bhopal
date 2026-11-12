import { Link, NavLink, useNavigate } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const signOut = () => {
    // Administrators keep returning to their own sign-in screen; residents go
    // back to the public home page.
    logout();
    navigate(isAdmin ? "/admin/login" : "/", { replace: true });
  };

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" to="/home" aria-label="Nagarik home">
          <span className="brand-mark">N</span>
          <span>
            NAGARIK
            <small>{t("app.tagline")}</small>
          </span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/home">{t("nav.home")}</NavLink>
          <NavLink to="/complaints">{t("nav.complaints")}</NavLink>
          <NavLink to="/map">{t("nav.map")}</NavLink>

          {user ? (
            <>
              <NavLink to="/dashboard">{t("nav.dashboard")}</NavLink>
              <NavLink to="/notifications">{t("nav.alerts")}</NavLink>
              {isAdmin && <NavLink to="/admin">{t("nav.admin")}</NavLink>}
              <NavLink to="/profile" className="nav-user">
                {user.name}
              </NavLink>
              <button
                type="button"
                className="nav-signout"
                onClick={signOut}
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
              >
                ⎋
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">{t("nav.signIn")}</NavLink>
              <NavLink to="/register">{t("nav.register")}</NavLink>
            </>
          )}

          <LanguageSwitcher compact />

          <Link className="nav-cta" to="/report">
            {t("nav.report")} <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
