import { useCallback, useState } from "react";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { STATUS_LIST, WASTE_TYPES } from "../../shared/constants";
import { call } from "../../utils/api";
import { downloadCsv, formatDate } from "../../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

const COLUMNS = [
  { label: "Complaint ID", value: (row) => row.id },
  { label: "Reported on", value: (row) => formatDate(row.createdAt) },
  { label: "Reporter", value: (row) => row.userName },
  { label: "Email", value: (row) => row.userEmail },
  { label: "Waste type", value: (row) => row.wasteType },
  { label: "Ward", value: (row) => row.ward },
  { label: "Address", value: (row) => row.address },
  { label: "Priority", value: (row) => row.priority },
  { label: "Status", value: (row) => row.status },
  { label: "Days pending", value: (row) => row.days },
  { label: "Upvotes", value: (row) => row.upvotes },
  { label: "Representative", value: (row) => row.representative },
];

export default function AdminReports() {
  const [filters, setFilters] = useState({
    from: monthAgo(),
    to: today(),
    status: "",
    wasteType: "",
  });

  const load = useCallback(
    () =>
      call("listComplaints", {
        limit: 200,
        from: filters.from,
        to: filters.to,
        status: filters.status,
        wasteType: filters.wasteType,
      }),
    [filters]
  );

  const { data, loading, error } = useService(load);

  const items = data?.items || [];
  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const exportCsv = () => {
    downloadCsv(
      `nagarik-complaints-${filters.from}-to-${filters.to}.csv`,
      COLUMNS,
      items
    );
  };

  return (
    <>
      <section className="admin-card">
        <h2>
          Reports
          <small>{loading ? "Loading…" : `${items.length} record(s)`}</small>
        </h2>

        <div className="admin-toolbar">
          <label className="admin-field">
            From
            <input type="date" value={filters.from} max={filters.to} onChange={(event) => update("from", event.target.value)} />
          </label>

          <label className="admin-field">
            To
            <input type="date" value={filters.to} min={filters.from} onChange={(event) => update("to", event.target.value)} />
          </label>

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

          <button type="button" className="small-button" onClick={exportCsv} disabled={items.length === 0}>
            Export CSV
          </button>
        </div>

        {error && <p className="form-message" role="alert">{error}</p>}

        {!loading && items.length === 0 ? (
          <p className="admin-empty">No complaints were filed in this period with these filters.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Reporter</th>
                  <th>Waste</th>
                  <th>Ward</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>#{row.id.slice(-6)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.userName}</td>
                    <td>{row.wasteType}</td>
                    <td>{row.ward}</td>
                    <td>{row.priority}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.upvotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="admin-note">
        Exports include the address and contact details of the reporter, so share the file only with
        the ward team that needs it.
      </p>
    </>
  );
}
