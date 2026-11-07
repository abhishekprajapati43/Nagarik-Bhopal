import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = register({
      name: data.get("name"),
      email: data.get("email"),
      password: data.get("password"),
    });

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    navigate("/login", { state: { message: result.message } });
  }

  return (
    <section className="form-page auth-page">
      <div className="auth-card">
        <p className="eyebrow eyebrow-dark">JOIN YOUR NEIGHBOURS</p>
        <h1>Make your voice <em>count.</em></h1>
        <p>Create an account to take part in a better Bhopal.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Your name
            <input name="name" required autoComplete="name" placeholder="Full name" />
          </label>
          <label>Email address
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label>Password
            <input name="password" type="password" required minLength="6" autoComplete="new-password" placeholder="At least 6 characters" />
          </label>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="button button-dark full-button" type="submit">Create account <span>↗</span></button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
        <p className="local-note">This demo keeps account details in this browser only.</p>
      </div>
    </section>
  );
}
