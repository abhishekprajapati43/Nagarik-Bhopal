import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CategorySelect, IssueSelect } from "../../components/ComplaintCategoryFields";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { PRIORITY_LIST, STATUS_LIST } from "../../shared/constants";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { complaintCategoryName, complaintTypeLabel } from "../../utils/complaint";
import { formatDate } from "../../utils/format";

export default function AdminComplaints() {
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    wardId: "",
    zoneNumber: "",
    complaintCategory: "",
    complaintType: "",
    assignedOfficerId: "",
    representativeId: "",
    from: "",
    to: "",
  });
  const [selectedId, setSelectedId] = useState("");
  const [statusDraft, setStatusDraft] = useState({ status: "", note: "" });
  const [assignDraft, setAssignDraft] = useState({
    wardId: "",
    representativeId: "",
    officerId: "",
  });
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
        zoneNumber: filters.zoneNumber,
        complaintCategory: filters.complaintCategory,
        complaintType: filters.complaintType,
        assignedOfficerId: filters.assignedOfficerId,
        representativeId: filters.representativeId,
        from: filters.from,
        to: filters.to,
      }),
    [filters]
  );

  const { data, loading, error: loadError, reload } = useService(load);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);

  const loadReps = useCallback(() => call("listRepresentatives"), []);
  const { data: repsData } = useService(loadReps);

  const loadOfficers = useCallback(() => call("listOfficers"), []);
  const { data: officersData } = useService(loadOfficers);

  const complaints = data?.items || [];
  const wards = wardsData?.items || [];
  const representatives = repsData?.items || [];
  const officers = officersData?.items || [];
  const zones = useMemo(
    () =>
      [...new Set(wards.map((ward) => ward.zoneNumber).filter((zone) => zone !== null))]
        .sort((left, right) => left - right),
    [wards]
  );
  const selected = complaints.find((complaint) => complaint.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    setStatusDraft({ status: selected.status, note: "" });
    setAssignDraft({
      wardId: selected.wardId || "",
      representativeId: selected.representativeId || "",
      officerId: selected.assignedOfficerId || "",
    });
  }, [
    selected?.id,
    selected?.status,
    selected?.wardId,
    selected?.representativeId,
    selected?.assignedOfficerId,
  ]);

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const updateCategory = (complaintCategory) =>
    setFilters((current) => ({ ...current, complaintCategory, complaintType: "" }));

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
        officerId: assignDraft.officerId,
      });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const acceptSelected = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("acceptComplaint", { id: selected.id });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () =>
    setFilters({
      search: "",
      status: "",
      wardId: "",
      zoneNumber: "",
      complaintCategory: "",
      complaintType: "",
      assignedOfficerId: "",
      representativeId: "",
      from: "",
      to: "",
    });

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
            placeholder="Search id, address, ward, councillor, reporter…"
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

          <CategorySelect value={filters.complaintCategory} onChange={updateCategory} />

          <IssueSelect
            category={filters.complaintCategory}
            value={filters.complaintType}
            onChange={(value) => update("complaintType", value)}
          />

          <select value={filters.wardId} onChange={(event) => update("wardId", event.target.value)} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id}>
                {ward.wardNumber ? `Ward ${ward.wardNumber} · ` : ""}{ward.name} · {ward.area}
              </option>
            ))}
          </select>

          <select
            value={filters.zoneNumber}
            onChange={(event) => update("zoneNumber", event.target.value)}
            aria-label="Zone"
          >
            <option value="">All zones</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>Zone {zone}</option>
            ))}
          </select>

          <select
            value={filters.assignedOfficerId}
            onChange={(event) => update("assignedOfficerId", event.target.value)}
            aria-label="Officer"
          >
            <option value="">All officers</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}{officer.employeeCode ? ` · ${officer.employeeCode}` : ""}
              </option>
            ))}
          </select>

          <select
            value={filters.representativeId}
            onChange={(event) => update("representativeId", event.target.value)}
            aria-label="Representative"
          >
            <option value="">All representatives</option>
            {representatives.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}{person.ward ? ` · ${person.ward}` : ""}
              </option>
            ))}
          </select>

          <label className="admin-field">
            From
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => update("from", event.target.value)}
            />
          </label>

          <label className="admin-field">
            To
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>

          <button type="button" className="small-button" onClick={resetFilters}>
            Reset filters
          </button>
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
                  <th>Category</th>
                  <th>Issue</th>
                  <th>Ward</th>
                  <th>Officer</th>
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
                    <td>{complaintCategoryName(complaint)}</td>
                    <td>{complaintTypeLabel(complaint)}</td>
                    <td>{complaint.ward}</td>
                    <td>{complaint.assignedOfficer || "Not assigned"}</td>
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
            <small>{complaintTypeLabel(selected)} · {complaintCategoryName(selected)} · {formatDate(selected.createdAt)}</small>
          </h2>

          <p className="admin-note">
            {selected.address} · Reported by {selected.userName} ({selected.userEmail})
          </p>

          <div className="verification-actions">
            <Link className="small-button" to={`/complaint/${selected.id}`}>
              Open full details
            </Link>

            {selected.status === "Pending" && (
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={acceptSelected}
              >
                {busy ? "Accepting…" : "Accept complaint"}
              </button>
            )}
          </div>

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
            <h3>Ward, representative & sanitation officer</h3>
            <div className="admin-form">
              <label className="admin-field">Ward
                <select
                  value={assignDraft.wardId}
                  onChange={(event) => setAssignDraft((current) => ({ ...current, wardId: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.wardNumber ? `Ward ${ward.wardNumber} · ` : ""}{ward.name} · {ward.area}
                    </option>
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

              <label className="admin-field">Sanitation officer
                <select
                  value={assignDraft.officerId}
                  onChange={(event) =>
                    setAssignDraft((current) => ({ ...current, officerId: event.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {officers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name}
                      {officer.employeeCode ? ` · ${officer.employeeCode}` : ""}
                      {officer.zone ? ` · ${officer.zone}` : ""}
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
