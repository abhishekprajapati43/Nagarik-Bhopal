import { Link } from "react-router-dom";

/**
 * Minimal header for sign-in screens. It intentionally shows only the brand,
 * a link back to the public home page and one account action (Register or
 * Login), so no dashboard or authenticated navigation appears before sign-in.
 */
export default function AuthHeader({ action = null }) {
  return (
    <header className="auth-header">
      <div className="auth-header-inner">
        <Link className="auth-brand" to="/" aria-label="Bhopal Nagarik public home">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>
            BHOPAL NAGARIK
            <small>CIVIC CONNECT • BHOPAL</small>
          </span>
        </Link>

        <nav className="auth-header-nav" aria-label="Account navigation">
          <Link to="/">Home</Link>
          {action}
        </nav>
      </div>
    </header>
  );
}
