import { useCallback, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { formatDateTime } from "../../utils/format";

const STATUS_OPTIONS = ["All", "Pending", "Verified", "Rejected"];

const badgeClass = (status) =>
  status === "Verified"
    ? "pill pill-ok"
    : status === "Rejected"
      ? "pill pill-bad"
      : "pill pill-warn";

export default function AdminCitizenVerification() {
  const [status, setStatus] = useState("Pending");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [review, setReview] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [history, setHistory] = useState(null);

  const load = useCallback(
    () =>
      call("listCitizenVerifications", {
        status: status === "All" ? "" : status,
        search,
      }),
    [status, search]
  );

  const { data, loading, error: loadError, reload } = useService(load);
  const items = data?.items || [];

  const openReview = (user, decision) => {
    setReview({ user, decision });
    setRemarks(decision === "Rejected" ? user.verificationRemarks || "" : "");
    setMessage("");
    setError("");
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!review) return;

    const { user, decision } = review;

    if (decision === "Rejected" && !remarks.trim()) {
      setError("Add a remark explaining why the Aadhaar verification was rejected.");
      return;
    }

    setBusyId(user.id);
    setMessage("");
    setError("");

    try {
      const result = await call("reviewCitizenVerification", {
        userId: user.id,
        decision,
        remarks,
      });
      setMessage(result.message);
      setReview(null);
      setHistory(null);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusyId("");
    }
  };

  const loadHistory = async (user) => {
    setError("");
    setMessage("");
    setHistory({ user, items: [], loading: true });

    try {
      const result = await call("listVerificationAudit", { userId: user.id });
      setHistory({ user, items: result.items || [], loading: false });
    } catch (requestError) {
      setError(messageFor(requestError));
      setHistory(null);
    }
  };

  return (
    <>
      <section className="admin-card">
        <h2>
          Citizen verification
          <small>
            {loading
              ? "Loading…"
              : `${items.length} ${status === "All" ? "" : status.toLowerCase()} request(s)`}
          </small>
        </h2>

        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search by name, mobile, ward or last four digits"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search citizen verifications"
          />

          <label>
            Status
            <select
              aria-label="Verification status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        {(loadError || error) && <p className="form-message" role="alert">{loadError || error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        {!loading && items.length === 0 ? (
          <p className="admin-empty">
            No {status === "All" ? "" : status.toLowerCase()} verification requests match this view.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="verification-table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>Ward</th>
                  <th>Aadhaar</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.name}</b>
                      <br />
                      <small>{user.phone || user.email || "No contact"}</small>
                    </td>
                    <td>{user.ward}</td>
                    <td><code>{user.aadhaarMasked}</code></td>
                    <td>{formatDateTime(user.aadhaarSubmittedAt || user.createdAt)}</td>
                    <td>
                      <span className={badgeClass(user.verificationStatus)}>
                        {user.verificationStatus}
                      </span>
                    </td>
                    <td>{user.verificationRemarks || "—"}</td>
                    <td>
                      <div className="admin-inline-actions">
                        {user.verificationStatus !== "Verified" && (
                          <button
                            type="button"
                            className="small-button"
                            disabled={busyId === user.id}
                            onClick={() => openReview(user, "Verified")}
                          >
                            Approve
                          </button>
                        )}
                        {user.verificationStatus !== "Rejected" && (
                          <button
                            type="button"
                            className="small-button danger"
                            disabled={busyId === user.id}
                            onClick={() => openReview(user, "Rejected")}
                          >
                            Reject
                          </button>
                        )}
                        <button
                          type="button"
                          className="small-button"
                          onClick={() => loadHistory(user)}
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {review && (
        <section className="admin-card">
          <h2>
            {review.decision === "Verified" ? "Approve verification" : "Reject verification"}
            <small>{review.user.name}</small>
          </h2>

          <div className="verification-review">
            <p>
              <b>Aadhaar</b>
              <br />
              <code>{review.user.aadhaarMasked}</code>
            </p>
            <p>
              <b>Citizen</b>
              <br />
              {review.user.name} · {review.user.phone || review.user.email || "No contact"}
            </p>
            <p>
              <b>Ward</b>
              <br />
              {review.user.ward}
            </p>
          </div>

          <form onSubmit={submitReview} className="admin-form">
            <label className="admin-field">
              {review.decision === "Rejected" ? "Rejection remarks (required)" : "Remarks (optional)"}
              <textarea
                rows="3"
                maxLength="500"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder={
                  review.decision === "Rejected"
                    ? "Explain what needs to be corrected before resubmission"
                    : "Optional note for the audit history"
                }
              />
            </label>

            <div className="admin-inline-actions admin-form-wide">
              <button
                className={review.decision === "Rejected" ? "button danger" : "button button-dark"}
                type="submit"
                disabled={busyId === review.user.id}
              >
                {busyId === review.user.id
                  ? "Saving…"
                  : review.decision === "Verified"
                    ? "Confirm approval"
                    : "Confirm rejection"}
              </button>
              <button
                className="button-ghost"
                type="button"
                onClick={() => {
                  setReview(null);
                  setRemarks("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {history && (
        <section className="admin-card">
          <h2>
            Verification history
            <small>{history.user.name}</small>
          </h2>

          {history.loading ? (
            <p className="admin-empty">Loading history…</p>
          ) : history.items.length === 0 ? (
            <p className="admin-empty">No verification actions recorded yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="verification-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Admin</th>
                    <th>Date &amp; time</th>
                    <th>Result</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.action}</td>
                      <td>{entry.by}</td>
                      <td>{formatDateTime(entry.at)}</td>
                      <td>
                        <span className={badgeClass(entry.result)}>{entry.result}</span>
                      </td>
                      <td>{entry.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button type="button" className="small-button" onClick={() => setHistory(null)}>
            Close history
          </button>
        </section>
      )}

      <p className="admin-note">
        Administrators can only see the masked Aadhaar number (XXXX XXXX 1234). Full Aadhaar
        numbers are encrypted in the database and are never returned by any API or downloadable
        report. Only verified residents can submit complaints, and every decision is written to
        the audit log with the administrator's name.
      </p>
    </>
  );
}
