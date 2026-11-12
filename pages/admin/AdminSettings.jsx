import { useCallback, useEffect, useMemo, useState } from "react";
import { useService } from "../../hooks/useService";
import { EMAIL_TEMPLATES } from "../../shared/constants";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { formatDateTime } from "../../utils/format";

const TEMPLATE_LABELS = {
  complaintSubmitted: "Complaint registration",
  complaintAccepted: "Complaint accepted",
  officerAssigned: "Officer assigned",
  workStarted: "Work started",
  complaintResolved: "Complaint resolved",
  complaintClosed: "Complaint closed",
  complaintReopened: "Complaint reopened",
};

const templateDefaults = () =>
  Object.fromEntries(
    Object.entries(EMAIL_TEMPLATES).map(([key, template]) => [
      key,
      { subject: template.subject, body: template.body },
    ])
  );

export default function AdminSettings() {
  const load = useCallback(() => call("getSettings"), []);
  const { data, loading, error: loadError, reload } = useService(load);

  const loadOutbox = useCallback(() => call("listEmailOutbox", { limit: 25 }), []);
  const { data: outboxData, reload: reloadOutbox } = useService(loadOutbox);

  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    const templates = templateDefaults();
    for (const [key, value] of Object.entries(data.settings.emailTemplates || {})) {
      if (templates[key]) templates[key] = { ...templates[key], ...value };
    }
    setForm({ ...data.settings, emailTemplates: templates });
  }, [data]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const updateTemplate = (key, field, value) =>
    setForm((current) => ({
      ...current,
      emailTemplates: {
        ...current.emailTemplates,
        [key]: { ...current.emailTemplates[key], [field]: value },
      },
    }));

  const outbox = outboxData?.items || [];

  const delivered = useMemo(
    () => outbox.filter((item) => item.status === "sent").length,
    [outbox]
  );

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
        emailNotifications: form.emailNotifications,
        emailTemplates: form.emailTemplates,
      });
      setForm((current) => ({ ...current, ...result.settings }));
      setMessage(result.message);
      await Promise.all([reload(), reloadOutbox()]);
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

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={form.emailNotifications !== false}
              onChange={(event) => update("emailNotifications", event.target.checked)}
            />
            Send email notifications for registration and status changes
          </label>

          <button type="submit" className="small-button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>

        {loadError && <p className="form-message" role="alert">{loadError}</p>}
        {error && <p className="form-message" role="alert">{error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}
      </section>

      <section className="admin-card">
        <h2>
          Email templates
          <small>Placeholders: {"{{code}} {{citizenName}} {{issue}} {{address}} {{status}} {{ward}} {{officerName}} {{city}} {{department}}"}</small>
        </h2>

        <p className="admin-note">
          Every status change picks the matching template below. Changes are saved with the button
          above. Without SMTP configuration the messages are queued in the outbox for review.
        </p>

        <div className="template-list">
          {Object.entries(form.emailTemplates || {}).map(([key, template]) => (
            <details key={key} className="template-card">
              <summary>
                <b>{TEMPLATE_LABELS[key] || key}</b>
                <span>{template.subject}</span>
              </summary>

              <label className="admin-field">Subject
                <input
                  maxLength="200"
                  value={template.subject}
                  onChange={(event) => updateTemplate(key, "subject", event.target.value)}
                />
              </label>

              <label className="admin-field">Body
                <textarea
                  rows="5"
                  maxLength="4000"
                  value={template.body}
                  onChange={(event) => updateTemplate(key, "body", event.target.value)}
                />
              </label>

              <button
                type="button"
                className="small-button"
                onClick={() =>
                  updateTemplate(key, "body", EMAIL_TEMPLATES[key]?.body || template.body)
                }
              >
                Restore default body
              </button>
            </details>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h2>
          Email outbox
          <small>{outbox.length} recent · {delivered} sent</small>
        </h2>

        {outbox.length === 0 ? (
          <p className="admin-empty">No email has been composed yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>To</th>
                  <th>Template</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {outbox.map((item) => (
                  <tr key={item.id}>
                    <td>{item.to}</td>
                    <td>{TEMPLATE_LABELS[item.templateKey] || item.templateKey || "—"}</td>
                    <td>{item.subject}</td>
                    <td>{item.status}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="admin-note">
        Turning off registrations hides the public sign-up form but does not affect
        existing accounts. The SLA is shown in analytics and used to flag overdue reports.
      </p>
    </>
  );
}
