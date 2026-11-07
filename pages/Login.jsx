import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.message || "");

  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = login({
      email: data.get("email"),
      password: data.get("password"),
    });

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    navigate("/complaints");
  }

  return (
    <section className="form-page auth-page">
      <div className="auth-card">
        <p className="eyebrow eyebrow-dark">GOOD TO SEE YOU AGAIN</p>
        <h1>Welcome <em>back.</em></h1>
        <p>Sign in to pick up where you left off.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email address
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label>Password
            <input name="password" type="password" required autoComplete="current-password" minLength="6" placeholder="At least 6 characters" />
          </label>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="button button-dark full-button" type="submit">Sign in <span>↗</span></button>
        </form>
        <p className="auth-switch">New to Nagarik? <Link to="/register">Create an account</Link></p>
        <p className="local-note">This demo keeps account details in this browser only.</p>
      </div>
    </section>
  );
}
