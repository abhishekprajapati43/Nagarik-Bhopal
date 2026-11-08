import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";

/**
 * Administrator sign-in. Deliberately separate from /login: the service
 * refuses resident accounts here and refuses admin accounts on /login.
 */
export default function AdminLogin() {
  const { adminLogin, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.message || "");
  const [submitting, setSubmitting] = useState(false);

  // Where a guard sent the administrator before they signed in.
  const from = location.state?.from;
  const redirectTo = from && from.startsWith("/admin") && from !== "/admin/login" ? from : "/admin";

  // Already signed in as an administrator? Go straight to the console.
  if (isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      setMessage("Enter your work email and password.");
      return;
    }

    setMessage("");
    setSubmitting(true);
    const result = await adminLogin({ email, password });
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    navigate(redirectTo, { replace: true });
  }

  return (
    <section className="form-page auth-page">
      <div className="auth-card admin-auth-card">
        <p className="eyebrow eyebrow-dark">CITY OPERATIONS · RESTRICTED ACCESS</p>
        <h1>Admin <em>console.</em></h1>
        <p>Sign in with your municipal administrator account to manage complaints.</p>

        <form onSubmit={submit} className="auth-form" noValidate>
          <label htmlFor="admin-email">Work email
            <input
              id="admin-email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder="admin@nagarik.bhopal"
            />
          </label>
          <label htmlFor="admin-password">Password
            <PasswordInput
              id="admin-password"
              name="password"
              label="Password"
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
          </label>

          {message && <p className="form-message" role="alert">{message}</p>}

          <button className="button button-dark full-button" type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Enter admin panel"} <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p className="auth-switch">Reporting an issue yourself? <Link to="/login">Resident sign-in</Link></p>
        <p className="local-note">Demo admin · admin@nagarik.bhopal / Admin@123</p>
        <p className="auth-switch auth-switch-muted">
          <Link to="/">← Back to public home</Link>
        </p>
      </div>
    </section>
  );
}
