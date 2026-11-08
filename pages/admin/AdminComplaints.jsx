import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { PRIORITY_LIST, STATUS_LIST, WASTE_TYPES } from "../../shared/constants";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { formatDate } from "../../utils/format";

export default function AdminComplaints() {
  const [filters, setFilters] = useState({ search: "", status: "", wardId: "", wasteType: "" });
  const [selectedId, setSelectedId] = useState("");
  const [statusDraft, setStatusDraft] = useState({ status: "", note: "" });
  const [assignDraft, setAssignDraft] = useState({ wardId: "", representativeId: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      call("listComplaints", {
        limit: 50,
        search: filters.search,
        status: filters.status,
        wardId: filters.wardId,
        wasteType: filters.wasteType,
      }),
    [filters]
  );

  const { data, loading, error: loadError, reload } = useService(load);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);

  const loadReps = useCallback(() => call("listRepresentatives"), []);
  const { data: repsData } = useService(loadReps);

  const complaints = data?.items || [];
  const wards = wardsData?.items || [];
  const representatives = repsData?.items || [];
  const selected = complaints.find((complaint) => complaint.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    setStatusDraft({ status: selected.status, note: "" });
    setAssignDraft({
      wardId: selected.wardId || "",
      representativeId: selected.representativeId || "",
    });
  }, [selected?.id, selected?.status, selected?.wardId, selected?.representativeId]);

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const saveStatus = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("updateComplaintStatus", {
        id: selected.id,
        status: statusDraft.status,
        note: statusDraft.note,
      });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("assignComplaint", {
        id: selected.id,
        wardId: assignDraft.wardId,
        representativeId: assignDraft.representativeId,
      });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="admin-card">
        <h2>
          Complaint management
          <small>{loading ? "Loading…" : `${complaints.length} shown`}</small>
        </h2>

        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search id, address, reporter…"
            value={filters.search}
            onChange={(event) => update("search", event.target.value)}
            aria-label="Search complaints"
          />

          <select value={filters.status} onChange={(event) => update("status", event.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUS_LIST.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={filters.wasteType} onChange={(event) => update("wasteType", event.target.value)} aria-label="Waste type">
            <option value="">All waste types</option>
            {WASTE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select value={filters.wardId} onChange={(event) => update("wardId", event.target.value)} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
            ))}
          </select>
        </div>

        {(loadError || error) && <p className="form-message" role="alert">{loadError || error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        {!loading && complaints.length === 0 ? (
          <p className="admin-empty">No complaints match these filters.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Reporter</th>
                  <th>Waste</th>
                  <th>Ward</th>
                  <th>Priority</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((complaint) => (
                  <tr key={complaint.id}>
                    <td><Link to={`/complaint/${complaint.id}`}>#{complaint.id.slice(-6)}</Link></td>
                    <td>{complaint.userName}</td>
                    <td>{complaint.wasteType}</td>
                    <td>{complaint.ward}</td>
                    <td>{complaint.priority}</td>
                    <td>{complaint.days}</td>
                    <td><StatusBadge status={complaint.status} /></td>
                    <td>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => setSelectedId(selectedId === complaint.id ? "" : complaint.id)}
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
            <small>{selected.wasteType} · {formatDate(selected.createdAt)}</small>
          </h2>

          <p className="admin-note">
            {selected.address} · Reported by {selected.userName} ({selected.userEmail})
          </p>

          <div className="admin-panel">
            <h3>Update status</h3>
            <div className="admin-form">
              <label className="admin-field">New status
                <select
                  value={statusDraft.status}
                  onChange={(event) => setStatusDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  {STATUS_LIST.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="admin-field">Note to resident
                <input
                  placeholder="e.g. Team dispatched to the site"
                  maxLength="200"
                  value={statusDraft.note}
                  onChange={(event) => setStatusDraft((current) => ({ ...current, note: event.target.value }))}
                />
              </label>

              <button type="button" className="small-button" disabled={busy || statusDraft.status === selected.status} onClick={saveStatus}>
                {busy ? "Saving…" : statusDraft.status === selected.status ? "Status unchanged" : "Update status"}
              </button>
            </div>
          </div>

          <div className="admin-panel">
            <h3>Ward & representative</h3>
            <div className="admin-form">
              <label className="admin-field">Ward
                <select
                  value={assignDraft.wardId}
                  onChange={(event) => setAssignDraft((current) => ({ ...current, wardId: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
                  ))}
                </select>
              </label>

              <label className="admin-field">Representative
                <select
                  value={assignDraft.representativeId}
                  onChange={(event) =>
                    setAssignDraft((current) => ({ ...current, representativeId: event.target.value }))
                  }
                >
                  <option value="">Not assigned</option>
                  {representatives.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}{person.ward ? ` · ${person.ward}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="small-button" disabled={busy} onClick={saveAssignment}>
                Save assignment
              </button>
            </div>
          </div>

          <div className="admin-panel">
            <h3>Timeline</h3>
            {(selected.timeline || []).map((entry, index) => (
              <p className="admin-note" key={`${entry.at}-${index}`}>
                <StatusBadge status={entry.status} /> {entry.note} — {formatDate(entry.at)}
              </p>
            ))}
          </div>
        </section>
      )}

      <p className="admin-note">
        Priorities available: {PRIORITY_LIST.join(", ")}. Status changes notify the resident automatically.
      </p>
    </>
  );
}
