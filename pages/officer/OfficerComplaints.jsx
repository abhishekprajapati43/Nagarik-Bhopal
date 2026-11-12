import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { STATUS, STATUS_LIST } from "../../shared/constants";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { complaintCategoryName, complaintTypeLabel } from "../../utils/complaint";
import { formatDate, formatDateTime } from "../../utils/format";
import { prepareImage } from "../../utils/image";

const EMPTY_DRAFT = {
  note: "",
  workNotes: "",
  beforePhoto: "",
  afterPhoto: "",
};

const canStartWork = (status) =>
  [STATUS.PENDING, STATUS.ACCEPTED, STATUS.ASSIGNED, STATUS.REOPENED].includes(status);
const isFinished = (status) =>
  [STATUS.CITIZEN_VERIFICATION, STATUS.CLOSED, STATUS.REJECTED].includes(status);

export default function OfficerComplaints() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [selectedId, setSelectedId] = useState(searchParams.get("id") || "");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      call("listOfficerComplaints", {
        limit: 100,
        search: filters.search,
        status: filters.status,
      }),
    [filters]
  );

  const { data, loading, error: loadError, reload } = useService(load);
  const complaints = data?.items || [];

  // The list rows are lightweight; the management panel needs the timeline,
  // comments and status history, so the selection is loaded in full.
  const loadDetail = useCallback(
    () =>
      selectedId
        ? call("getOfficerComplaint", { id: selectedId })
        : Promise.resolve(null),
    [selectedId]
  );
  const {
    data: detailData,
    error: detailError,
    reload: reloadDetail,
  } = useService(loadDetail);

  const selected =
    (detailData?.complaint?.id === selectedId ? detailData.complaint : null) ||
    complaints.find((complaint) => complaint.id === selectedId) ||
    null;

  useEffect(() => {
    if (!selected) {
      setDraft(EMPTY_DRAFT);
      return;
    }

    setDraft({
      note: "",
      workNotes: selected.workNotes || "",
      beforePhoto: selected.beforePhoto || "",
      afterPhoto: selected.afterPhoto || "",
    });
  }, [selected?.id, selected?.updatedAt, selected?.workNotes, selected?.beforePhoto, selected?.afterPhoto]);

  const select = (id) => {
    const next = selectedId === id ? "" : id;
    setSelectedId(next);
    setMessage("");
    setError("");
    setSearchParams(next ? { id: next } : {});
  };

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const attach = async (event, field, label) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    try {
      const dataUrl = await prepareImage(file, { maxDimension: 1100, quality: 0.68 });
      setDraft((current) => ({ ...current, [field]: dataUrl }));
    } catch (photoError) {
      setError(messageFor(photoError) || `${label} could not be prepared.`);
    }
  };

  const run = async (action, successFallback) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await action(selected);
      setMessage(result?.message || successFallback);
      await Promise.all([reload(), reloadDetail()]);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveWork = () =>
    run(
      () =>
        call("updateOfficerWork", {
          id: selected.id,
          note: draft.note,
          workNotes: draft.workNotes,
          beforePhoto: draft.beforePhoto,
          afterPhoto: draft.afterPhoto,
        }),
      "Work details saved."
    );

  const startWork = () =>
    run(
      () =>
        call("updateOfficerStatus", {
          id: selected.id,
          status: STATUS.IN_PROGRESS,
          note: draft.note,
          workNotes: draft.workNotes,
          beforePhoto: draft.beforePhoto,
          afterPhoto: draft.afterPhoto,
        }),
      "Work started."
    );

  const resolve = () =>
    run(
      () =>
        call("resolveOfficerComplaint", {
          id: selected.id,
          note: draft.note,
          workNotes: draft.workNotes,
          beforePhoto: draft.beforePhoto,
          afterPhoto: draft.afterPhoto,
        }),
      "Complaint resolved."
    );

  return (
    <>
      <section className="admin-card">
        <h2>
          My assigned complaints
          <small>{loading ? "Loading…" : `${complaints.length} shown`}</small>
        </h2>

        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search id, address, issue…"
            value={filters.search}
            onChange={(event) => update("search", event.target.value)}
            aria-label="Search assigned complaints"
          />
          <select
            value={filters.status}
            onChange={(event) => update("status", event.target.value)}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUS_LIST.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {(loadError || detailError || error) && (
          <p className="form-message" role="alert">{loadError || detailError || error}</p>
        )}
        {message && <p className="form-message" role="status">{message}</p>}

        {!loading && complaints.length === 0 ? (
          <p className="admin-empty">
            No complaints match this view. New work appears here as soon as an administrator
            assigns it.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Reporter</th>
                  <th>Category</th>
                  <th>Issue</th>
                  <th>Address</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((complaint) => (
                  <tr key={complaint.id}>
                    <td>#{complaint.id.slice(-6)}</td>
                    <td>{complaint.userName}</td>
                    <td>{complaintCategoryName(complaint)}</td>
                    <td>{complaintTypeLabel(complaint)}</td>
                    <td>{complaint.address}</td>
                    <td>{complaint.priority}</td>
                    <td><StatusBadge status={complaint.status} /></td>
                    <td>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => select(complaint.id)}
                      >
                        {selectedId === complaint.id ? "Close" : "Manage"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="admin-card">
          <h2>
            Managing #{selected.id.slice(-6)}
            <small>
              {complaintTypeLabel(selected)} · {complaintCategoryName(selected)} ·{" "}
              {formatDate(selected.createdAt)}
            </small>
          </h2>

          <p className="admin-note">
            {selected.address} · {selected.ward} · Reported by {selected.userName}
          </p>
          <p className="admin-note">
            Status <StatusBadge status={selected.status} /> · Priority {selected.priority} ·{" "}
            Reported {formatDateTime(selected.createdAt)}
          </p>

          <div className="officer-photo-grid">
            <figure>
              <figcaption>Reported photo</figcaption>
              {selected.image ? (
                <img src={selected.image} alt="Reported issue" />
              ) : (
                <div className="officer-photo-empty">No citizen photo</div>
              )}
            </figure>

            <figure>
              <figcaption>Before cleaning</figcaption>
              {draft.beforePhoto ? (
                <img src={draft.beforePhoto} alt="Before cleaning" />
              ) : (
                <div className="officer-photo-empty">Not uploaded</div>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Upload before cleaning photo"
                onChange={(event) => attach(event, "beforePhoto", "Before photo")}
              />
            </figure>

            <figure>
              <figcaption>After cleaning</figcaption>
              {draft.afterPhoto ? (
                <img src={draft.afterPhoto} alt="After cleaning" />
              ) : (
                <div className="officer-photo-empty">Not uploaded</div>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Upload after cleaning photo"
                onChange={(event) => attach(event, "afterPhoto", "After photo")}
              />
            </figure>
          </div>

          <div className="admin-panel">
            <h3>Work update</h3>
            <div className="admin-form">
              <label className="admin-field">
                Work notes
                <textarea
                  rows="3"
                  maxLength="1000"
                  placeholder="What was cleaned, how many workers, equipment used…"
                  value={draft.workNotes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, workNotes: event.target.value }))
                  }
                />
              </label>

              <label className="admin-field">
                Note for the citizen
                <input
                  maxLength="200"
                  placeholder="e.g. Drain cleared and area disinfected"
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="officer-actions">
              <button type="button" className="small-button" disabled={busy} onClick={saveWork}>
                Save work details
              </button>

              <button
                type="button"
                className="small-button"
                disabled={busy || !canStartWork(selected.status)}
                onClick={startWork}
              >
                {busy ? "Saving…" : "Start work"}
              </button>

              <button
                type="button"
                className="button button-dark"
                disabled={busy || isFinished(selected.status)}
                onClick={resolve}
              >
                {busy ? "Saving…" : "Mark as resolved"}
              </button>
            </div>

            <p className="admin-note">
              Marking resolved asks the citizen “Has your issue been resolved?”. A Yes closes the
              complaint; a No reopens it and alerts the administrator.
            </p>
          </div>

          {selected.workNotes && (
            <div className="admin-panel">
              <h3>Saved work notes</h3>
              <p className="admin-note">{selected.workNotes}</p>
            </div>
          )}

          <div className="admin-panel">
            <h3>Timeline</h3>
            {(selected.timeline || []).length === 0 ? (
              <p className="admin-note">No timeline events yet.</p>
            ) : (
              <ol className="timeline officer-timeline">
                {(selected.timeline || []).map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <StatusBadge status={entry.status} />
                    <p>{entry.note || `Status changed to ${entry.status}.`}</p>
                    <small>{formatDateTime(entry.at)} · {entry.by || "System"}</small>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {(selected.statusHistory || []).length > 0 && (
            <div className="admin-panel">
              <h3>Status history</h3>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>By</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.statusHistory || []).map((entry, index) => (
                      <tr key={`${entry.at}-${index}`}>
                        <td>{entry.from || "—"}</td>
                        <td><StatusBadge status={entry.to} /></td>
                        <td>{entry.by || "System"}</td>
                        <td>{formatDateTime(entry.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
