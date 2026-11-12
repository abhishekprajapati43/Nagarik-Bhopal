import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";

/**
 * Sanitation officer sign-in. The service refuses resident and administrator
 * accounts here, and the officer route guard keeps them out of the console.
 */
export default function OfficerLogin() {
  const { officerLogin, isOfficer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.message || "");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from;
  const redirectTo =
    from && from.startsWith("/officer") && from !== "/officer/login"
      ? from
      : "/officer/dashboard";

  if (isOfficer) {
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
    const result = await officerLogin({ email, password });
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
        <p className="eyebrow eyebrow-dark">CITY SANITATION · OFFICER ACCESS</p>
        <h1>Officer <em>console.</em></h1>
        <p>Sign in with your sanitation officer account to manage assigned complaints.</p>

        <form onSubmit={submit} className="auth-form" noValidate>
          <label htmlFor="officer-email">Work email
            <input
              id="officer-email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder="officer@nagarik.bhopal"
            />
          </label>
          <label htmlFor="officer-password">Password
            <PasswordInput
              id="officer-password"
              name="password"
              label="Password"
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
          </label>

          {message && <p className="form-message" role="alert">{message}</p>}

          <button className="button button-dark full-button" type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Enter officer console"} <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p className="auth-switch">Reporting an issue yourself? <Link to="/login">Resident sign-in</Link></p>
        <p className="local-note">Demo officer · officer@nagarik.bhopal / Officer@123</p>
        <p className="auth-switch auth-switch-muted">
          <Link to="/">← Back to public home</Link>
        </p>
      </div>
    </section>
  );
}
