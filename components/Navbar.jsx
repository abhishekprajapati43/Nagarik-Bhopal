import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link className="brand" to="/" aria-label="Nagarik home">
          <span className="brand-mark">N</span>
          <span>NAGARIK<small>BHOPAL • CIVIC CONNECT</small></span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <a href="/#how-it-works">How it works</a>
          <NavLink to="/complaints">Complaints</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/map">Map</NavLink>
          {user ? (
            <button type="button" className="nav-user" onClick={signOut} title="Sign out">
              {user.name} <span aria-hidden="true">⎋</span>
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
          <Link className="nav-cta" to="/report">
            Report an issue <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
