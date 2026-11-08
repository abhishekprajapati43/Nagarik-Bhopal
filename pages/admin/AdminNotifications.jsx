import { useCallback, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { timeAgo } from "../../utils/format";

export default function AdminNotifications() {
  const [form, setForm] = useState({ title: "", body: "", wardId: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => call("listNotifications"), []);
  const { data, loading, reload } = useService(load);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);

  const wards = wardsData?.items || [];
  const history = (data?.items || []).filter((item) => item.type === "broadcast");

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    setMessage("");
    setError("");

    try {
      const result = await call("broadcastNotification", form);
      setMessage(result.message);
      setForm({ title: "", body: "", wardId: "" });
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="admin-card">
        <h2>Send an announcement</h2>

        <form className="admin-form" onSubmit={send}>
          <label className="admin-field">Title
            <input
              required
              minLength="3"
              maxLength="80"
              placeholder="Ward 12 sweepers on leave today"
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </label>

          <label className="admin-field">Audience
            <select value={form.wardId} onChange={(event) => update("wardId", event.target.value)}>
              <option value="">All active residents</option>
              {wards.map((ward) => (
                <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
              ))}
            </select>
          </label>

          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            Message
            <textarea
              required
              minLength="3"
              maxLength="300"
              placeholder="Keep it short and actionable."
              value={form.body}
              onChange={(event) => update("body", event.target.value)}
            />
          </label>

          <button type="submit" className="small-button" disabled={sending}>
            {sending ? "Sending…" : "Send announcement"}
          </button>
        </form>

        {error && <p className="form-message" role="alert">{error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}
      </section>

      <section className="admin-card">
        <h2>
          Your recent notifications
          <small>{loading ? "Loading…" : `${history.length} announcement(s)`}</small>
        </h2>

        {history.length === 0 ? (
          <p className="admin-empty">No announcements sent yet.</p>
        ) : (
          <ul className="notification-list">
            {history.map((item) => (
              <li className="notification" key={item.id}>
                <span className="notification-icon" aria-hidden="true">📣</span>
                <div className="notification-body">
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                  <small>{timeAgo(item.createdAt)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
