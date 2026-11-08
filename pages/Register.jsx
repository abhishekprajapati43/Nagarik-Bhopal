import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { useService } from "../hooks/useService";
import { call } from "../utils/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wardId, setWardId] = useState("ward-35");

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wards } = useService(loadWards);

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    const confirmation = String(data.get("confirmPassword"));

    if (password !== confirmation) {
      setMessage("The two passwords do not match.");
      return;
    }

    setMessage("");
    setSubmitting(true);
    const result = await register({
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      wardId: data.get("wardId"),
      password,
    });
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    navigate("/dashboard", { replace: true });
  }

  return (
    <section className="form-page auth-page">
      <div className="auth-card">
        <p className="eyebrow eyebrow-dark">JOIN YOUR NEIGHBOURS</p>
        <h1>Make your voice <em>count.</em></h1>
        <p>Create an account to report issues and follow them until they are fixed.</p>

        <form onSubmit={submit} className="auth-form" noValidate>
          <label>Your name
            <input name="name" required autoComplete="name" minLength="2" maxLength="60" placeholder="Full name" />
          </label>
          <label>Email address
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label>Phone <span className="label-hint">optional</span>
            <input name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
          </label>
          <label>Your ward
            <select name="wardId" value={wardId} onChange={(event) => setWardId(event.target.value)}>
              <option value="">Select your ward</option>
              {(wards?.items || []).map((ward) => (
                <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
              ))}
            </select>
          </label>
          <label htmlFor="register-password">Password
            <PasswordInput
              id="register-password"
              name="password"
              label="Password"
              required
              minLength="8"
              autoComplete="new-password"
              placeholder="At least 8 characters, one number"
            />
          </label>
          <label htmlFor="register-confirm">Confirm password
            <PasswordInput
              id="register-confirm"
              name="confirmPassword"
              label="Confirm password"
              required
              minLength="8"
              autoComplete="new-password"
              placeholder="Repeat your password"
            />
          </label>

          {message && <p className="form-message" role="alert">{message}</p>}

          <button className="button button-dark full-button" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"} <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
        <p className="local-note">
          Accounts and reports are stored on this device unless the city API is enabled.
        </p>
        <p className="auth-switch auth-switch-muted">
          <Link to="/">← Back to public home</Link>
        </p>
      </div>
    </section>
  );
}
