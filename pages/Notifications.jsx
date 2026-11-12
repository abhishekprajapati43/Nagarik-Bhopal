import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useService } from "../hooks/useService";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { timeAgo } from "../utils/format";

const ICONS = {
  status: "🔄",
  comment: "💬",
  upvote: "👍",
  complaint: "📌",
  broadcast: "📣",
  admin: "🛠️",
  system: "🔔",
};

export default function Notifications() {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call("listNotifications"), []);
  const { data, loading, error, reload } = useService(load);

  const markRead = async (id) => {
    setBusy(true);

    try {
      await call("markNotificationsRead", id ? { id } : {});
      await reload();
    } catch (markError) {
      setMessage(messageFor(markError));
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items || [];
  const unread = data?.unread || 0;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t("notif.title")}</h1>
          <p className="page-intro">
            {loading
              ? t("notif.loading")
              : items.length === 0
                ? t("notif.emptyHint")
                : t("notif.count", { unread, total: items.length })}
          </p>
        </div>
        {items.length > 0 && (
          <button type="button" className="button-ghost" disabled={busy} onClick={() => markRead()}>
            {t("notif.markAll")}
          </button>
        )}
      </div>

      {error && <p className="form-message" role="alert">{error}</p>}
      {message && <p className="form-message" role="status">{message}</p>}

      {!loading && items.length === 0 && (
        <p className="empty-state">{t("notif.empty")}</p>
      )}

      <ul className="notification-list">
        {items.map((item) => (
          <li key={item.id} className={item.read ? "notification" : "notification notification-unread"}>
            <span className="notification-icon" aria-hidden="true">
              {ICONS[item.type] || ICONS.system}
            </span>

            <div className="notification-body">
              <b>{item.title}</b>
              <p>{item.body}</p>
              <small>{timeAgo(item.createdAt)}</small>
            </div>

            <div className="notification-actions">
              {item.complaintId && <Link to={`/complaint/${item.complaintId}`}>{t("common.view")}</Link>}
              {!item.read && (
                <button type="button" className="link-button" disabled={busy} onClick={() => markRead(item.id)}>
                  {t("notif.markRead")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
