import { useCallback, useEffect, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";

export default function AdminSettings() {
  const load = useCallback(() => call("getSettings"), []);
  const { data, loading, error: loadError, reload } = useService(load);

  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const result = await call("saveSettings", {
        cityName: form.cityName,
        department: form.department,
        supportEmail: form.supportEmail,
        slaDays: form.slaDays,
        autoAssignWard: form.autoAssignWard,
        allowRegistration: form.allowRegistration,
        notifyOnNewComplaint: form.notifyOnNewComplaint,
      });
      setForm(result.settings);
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <section className="admin-card">
        <h2>City settings</h2>
        <p className="admin-empty">{loadError || "Loading settings…"}</p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card">
        <h2>
          City settings
          <small>Applies to every resident and report</small>
        </h2>

        <form className="admin-form" onSubmit={submit}>
          <label className="admin-field">City name
            <input
              required
              minLength="2"
              maxLength="40"
              value={form.cityName}
              onChange={(event) => update("cityName", event.target.value)}
            />
          </label>

          <label className="admin-field">Department
            <input
              required
              minLength="2"
              maxLength="80"
              value={form.department}
              onChange={(event) => update("department", event.target.value)}
            />
          </label>

          <label className="admin-field">Support email
            <input
              required
              type="email"
              value={form.supportEmail}
              onChange={(event) => update("supportEmail", event.target.value)}
            />
          </label>

          <label className="admin-field">Resolution SLA (days)
            <input
              required
              type="number"
              min="1"
              max="30"
              value={form.slaDays}
              onChange={(event) => update("slaDays", event.target.value)}
            />
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.autoAssignWard)}
              onChange={(event) => update("autoAssignWard", event.target.checked)}
            />
            Auto-assign the nearest ward from GPS
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.allowRegistration)}
              onChange={(event) => update("allowRegistration", event.target.checked)}
            />
            Allow new resident registrations
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.notifyOnNewComplaint)}
              onChange={(event) => update("notifyOnNewComplaint", event.target.checked)}
            />
            Notify administrators about new complaints
          </label>

          <button type="submit" className="small-button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>

        {loadError && <p className="form-message" role="alert">{loadError}</p>}
        {error && <p className="form-message" role="alert">{error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}
      </section>

      <p className="admin-note">
        Turning off registrations hides the public sign-up form but does not affect
        existing accounts. The SLA is shown in analytics and used to flag overdue reports.
      </p>
    </>
  );
}
