import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
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
          <span>NAGARIK<small>BHOPAL • CIVIC CONNECT</small></span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/home">Home</NavLink>
          <NavLink to="/complaints">Complaints</NavLink>
          <NavLink to="/map">Map</NavLink>

          {user ? (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/notifications">Alerts</NavLink>
              {isAdmin && <NavLink to="/admin">Admin</NavLink>}
              <NavLink to="/profile" className="nav-user">{user.name}</NavLink>
              <button
                type="button"
                className="nav-signout"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
              >
                ⎋
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}

          <Link className="nav-cta" to="/report">
            Report an issue <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
