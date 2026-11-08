import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useService } from "../hooks/useService";
import { call } from "../utils/api";

const maskIdentifier = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.includes("@")) {
    const [name, domain] = text.split("@");
    return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
  return `••••••${text.replace(/\D/g, "").slice(-4)}`;
};

/**
 * Password recovery guidance. The offline demo has no email service, so the
 * page validates the account identifier and tells the resident how to contact
 * the city office with a masked reference instead of pretending a mail was sent.
 */
export default function ForgotPassword() {
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => call("getSettings"), []);
  const { data } = useService(load);
  const settings = data?.settings;

  function submit(event) {
    event.preventDefault();
    const identifier = String(new FormData(event.currentTarget).get("identifier") ?? "").trim();

    if (!identifier) {
      setMessage("Enter the email address or mobile number linked to your account.");
      return;
    }

    setReference(maskIdentifier(identifier));
    setMessage("");
  }

  return (
    <section className="form-page auth-page">
      <div className="auth-card">
        <p className="eyebrow eyebrow-dark">ACCOUNT HELP</p>
        <h1>Forgot your <em>password?</em></h1>
        <p>
          Enter the email or mobile number linked to your account. In this local demo the
          city office resets passwords manually, so we will show you exactly who to contact.
        </p>

        <form onSubmit={submit} className="auth-form" noValidate>
          <label htmlFor="forgot-identifier">Email or mobile number
            <input
              id="forgot-identifier"
              name="identifier"
              type="text"
              required
              autoFocus
              autoComplete="username"
              placeholder="you@example.com or 98765 43210"
            />
          </label>

          {message && <p className="form-message" role="alert">{message}</p>}

          <button className="button button-dark full-button" type="submit">
            Continue <span aria-hidden="true">↗</span>
          </button>
        </form>

        {reference && (
          <div className="recovery-note" role="status">
            <b>Next step</b>
            <p>
              Contact <a href={`mailto:${settings?.supportEmail || "care@nagarik.bhopal"}`}>
                {settings?.supportEmail || "care@nagarik.bhopal"}
              </a>{" "}
              with your registered account <b>{reference}</b> and ask for a password reset.
            </p>
            <p>Demo resident · citizen@nagarik.bhopal / Citizen@123</p>
          </div>
        )}

        <p className="auth-switch">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
        <p className="auth-switch auth-switch-muted">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </section>
  );
}
