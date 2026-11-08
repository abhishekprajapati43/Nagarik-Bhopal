import { useState } from "react";

/**
 * Password input with an accessible show/hide control. Reused by the resident
 * sign-in, registration and administrator sign-in forms so the behaviour stays
 * identical everywhere.
 */
export default function PasswordInput({ id, name = "password", label, ...props }) {
  const [visible, setVisible] = useState(false);
  const inputId = id || `${name}-input`;

  return (
    <div className="password-field">
      <input
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        aria-label={label}
        {...props}
      />
      <button
        type="button"
        className="password-toggle"
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
