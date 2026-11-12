import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import AuthHeader from "../components/AuthHeader";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, user, isAdmin, isOfficer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.message || "");
  const [submitting, setSubmitting] = useState(false);

  // A guard can send the visitor here with the page they wanted to open.
  const from = location.state?.from;
  const redirectTo = from && !from.startsWith("/login") && !from.startsWith("/admin") ? from : "/dashboard";

  // An existing session should not see a sign-in form again.
  if (user) {
    return <Navigate to={isAdmin ? "/admin" : isOfficer ? "/officer/dashboard" : redirectTo} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (!identifier) {
      setMessage("Enter your email address or mobile number.");
      return;
    }

    if (!password) {
      setMessage("Enter your password.");
      return;
    }

    setMessage("");
    setSubmitting(true);
    const result = await login({ identifier, password });
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    navigate(redirectTo, { replace: true });
  }

  return (
    <>
      <AuthHeader
        action={<Link className="auth-header-cta" to="/register">Register</Link>}
      />

      <section className="form-page auth-page">
        <div className="auth-card">
          <p className="eyebrow eyebrow-dark">GOOD TO SEE YOU AGAIN</p>
          <h1>Welcome <em>back.</em></h1>
          <p>Sign in to track your reports and the issues around you.</p>

          <form onSubmit={submit} className="auth-form" noValidate>
            <label htmlFor="login-identifier">Email or mobile number
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                required
                autoFocus
                autoComplete="username"
                placeholder="you@example.com or 98765 43210"
              />
            </label>

            <label htmlFor="login-password">Password
              <PasswordInput
                id="login-password"
                name="password"
                label="Password"
                required
                autoComplete="current-password"
                placeholder="Your password"
              />
            </label>

            <div className="auth-form-row">
              <Link className="auth-text-link" to="/forgot-password">Forgot password?</Link>
            </div>

            {message && <p className="form-message" role="alert">{message}</p>}

            <button className="button button-dark full-button" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"} <span aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="auth-divider"><span>New to Nagarik?</span></div>

          <Link className="button button-ghost full-button auth-register" to="/register">
            Create an account
          </Link>

          <p className="auth-switch auth-switch-muted">
            City staff? <Link to="/admin/login">Administrator sign-in</Link>
            {" · "}
            <Link to="/officer/login">Sanitation officer sign-in</Link>
          </p>
          <p className="local-note">
            Demo resident · citizen@nagarik.bhopal / Citizen@123 · mobile 98111 22334
          </p>
        </div>
      </section>
    </>
  );
}
