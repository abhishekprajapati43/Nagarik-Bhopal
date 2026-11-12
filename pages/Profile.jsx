import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useService } from "../hooks/useService";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { formatDate } from "../utils/format";

export default function Profile() {
  const { user, updateProfile, submitAadhaar, logout } = useAuth();
  const navigate = useNavigate();
  const [detailsMessage, setDetailsMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [aadhaarMessage, setAadhaarMessage] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAadhaar, setSavingAadhaar] = useState(false);
  const [wardId, setWardId] = useState(user?.wardId || "");

  // Keep the controlled select in sync with the saved profile (the ward list
  // itself arrives asynchronously).
  useEffect(() => {
    setWardId(user?.wardId || "");
  }, [user?.wardId]);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);
  const wards = wardsData?.items || [];
  const verificationStatus = user?.verificationStatus || "Pending";
  const verificationBadge =
    verificationStatus === "Verified"
      ? "pill pill-ok"
      : verificationStatus === "Rejected"
        ? "pill pill-bad"
        : "pill pill-warn";

  async function saveDetails(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setSavingDetails(true);
    const result = await updateProfile({
      name: data.get("name"),
      phone: data.get("phone"),
      wardId: data.get("wardId"),
    });
    setSavingDetails(false);
    setDetailsMessage(result.ok ? "Profile updated." : result.message);
  }

  async function saveAadhaar(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const digits = String(data.get("aadhaarNumber") ?? "").replace(/[\s-]/g, "");

    if (!/^\d{12}$/.test(digits)) {
      setAadhaarMessage("Aadhaar number must contain exactly 12 digits.");
      return;
    }

    setSavingAadhaar(true);
    const result = await submitAadhaar({ aadhaarNumber: digits });
    setSavingAadhaar(false);
    setAadhaarMessage(result.message);

    if (result.ok) form.reset();
  }

  async function savePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setPasswordMessage("The two passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      const result = await call("changePassword", {
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      });
      setPasswordMessage(result.message);
      form.reset();
    } catch (error) {
      setPasswordMessage(messageFor(error));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="container">
      <h1>Your Profile</h1>
      <p className="page-intro">Keep your contact details current so ward teams can reach you.</p>

      <div className="profile-grid">
        <section className="profile-card">
          <h2>Personal details</h2>

          <form onSubmit={saveDetails} className="auth-form" noValidate>
            <label>Full name
              <input name="name" defaultValue={user?.name || ""} required minLength="2" maxLength="60" />
            </label>
            <label>Email address
              <input value={user?.email || ""} readOnly disabled />
            </label>
            <label>Phone
              <input name="phone" defaultValue={user?.phone || ""} placeholder="+91 98765 43210" />
            </label>
            <label>Ward
              <select name="wardId" value={wardId} onChange={(event) => setWardId(event.target.value)}>
                <option value="">Not set</option>
                {wards.map((ward) => (
                  <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
                ))}
              </select>
            </label>

            {detailsMessage && <p className="form-message" role="status">{detailsMessage}</p>}

            <button className="button button-dark" type="submit" disabled={savingDetails}>
              {savingDetails ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <aside className="profile-side">
          <section className="profile-card identity-card">
            <h2>Identity Verification</h2>

            <p className="identity-status">
              <span>Aadhaar status</span>
              <span className={verificationBadge}>{verificationStatus}</span>
            </p>

            <p>
              <b>Aadhaar number</b>
              <br />
              {user?.aadhaarMasked || "XXXX XXXX ----"}
            </p>

            {user?.aadhaarVerified && user?.aadhaarVerifiedAt && (
              <p><b>Verified on</b><br />{formatDate(user.aadhaarVerifiedAt)}</p>
            )}

            {verificationStatus === "Pending" && (
              <p className="identity-note">
                Your Aadhaar is waiting for city office review. You can submit complaints
                once it is verified.
              </p>
            )}

            {verificationStatus === "Rejected" && (
              <p className="identity-note">
                Your Aadhaar verification was rejected.
                {user?.verificationRemarks ? ` Reason: ${user.verificationRemarks}` : ""}
                {" "}You can correct the number and resubmit below.
              </p>
            )}

            {verificationStatus === "Verified" ? (
              <p className="identity-note">
                Your identity is verified. Only the last four digits are shown here.
              </p>
            ) : (
              <form onSubmit={saveAadhaar} className="auth-form" noValidate>
                <label>Aadhaar number
                  <input
                    name="aadhaarNumber"
                    required
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength="14"
                    placeholder="12-digit Aadhaar number"
                  />
                </label>
                <p className="label-hint">
                  Stored encrypted. The city office and you will only see XXXX XXXX 1234.
                </p>

                {aadhaarMessage && (
                  <p className="form-message" role="status">{aadhaarMessage}</p>
                )}

                <button className="button button-dark" type="submit" disabled={savingAadhaar}>
                  {savingAadhaar
                    ? "Submitting…"
                    : verificationStatus === "Rejected"
                      ? "Resubmit Aadhaar"
                      : "Submit for verification"}
                </button>
              </form>
            )}
          </section>

          <section className="profile-card">
            <h2>Account</h2>
            <p><b>Email</b><br />{user?.email}</p>
            <p><b>Role</b><br />{user?.role === "admin" ? "City administrator" : "Resident"}</p>
            <p><b>Member since</b><br />{formatDate(user?.createdAt)}</p>
            <button
              className="button button-dark"
              type="button"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
            >
              Sign out
            </button>
          </section>

          <section className="profile-card">
            <h2>Password</h2>
            <form onSubmit={savePassword} className="auth-form" noValidate>
              <label>Current password
                <input name="currentPassword" type="password" required autoComplete="current-password" />
              </label>
              <label>New password
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength="8"
                  autoComplete="new-password"
                  placeholder="At least 8 characters, one number"
                />
              </label>
              <label>Confirm new password
                <input name="confirmPassword" type="password" required minLength="8" autoComplete="new-password" />
              </label>

              {passwordMessage && <p className="form-message" role="status">{passwordMessage}</p>}

              <button className="button button-dark" type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update password"}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
