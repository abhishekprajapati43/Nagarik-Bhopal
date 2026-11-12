import { useCallback } from "react";
import { Link } from "react-router-dom";
import StatsCard from "../../components/StatsCard";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { call } from "../../utils/api";
import { complaintTypeLabel } from "../../utils/complaint";
import { formatDate } from "../../utils/format";

export default function OfficerDashboard() {
  const load = useCallback(() => call("officerDashboard"), []);
  const { data, loading, error } = useService(load);

  const stats = data?.stats;
  const officer = data?.officer;

  return (
    <>
      <section className="admin-card">
        <h2>
          My workload
          <small>
            {officer
              ? `${officer.employeeCode || "Officer"} · ${officer.zone} zone`
              : loading
                ? "Loading…"
                : "Sanitation officer"}
          </small>
        </h2>

        {error && <p className="form-message" role="alert">{error}</p>}

        <div className="admin-stats">
          <StatsCard title="Total Assigned" value={stats?.total ?? "—"} color="#2563eb" />
          <StatsCard title="Pending" value={stats?.pending ?? "—"} color="#f59e0b" />
          <StatsCard title="In Progress" value={stats?.inProgress ?? "—"} color="#dc2626" />
          <StatsCard title="Resolved" value={stats?.resolved ?? "—"} color="#16a34a" />
          <StatsCard title="Assigned Today" value={stats?.assignedToday ?? "—"} color="#7c3aed" />
        </div>

        <p className="admin-note">
          Pending includes newly assigned work. Resolved includes complaints awaiting citizen
          verification and closed complaints.
        </p>
      </section>

      <section className="admin-card">
        <h2>
          Recently assigned
          <small><Link to="/officer/complaints">Open work queue →</Link></small>
        </h2>

        {!loading && (data?.recent || []).length === 0 ? (
          <p className="admin-empty">
            No complaints are assigned to you yet. The city administrator will assign work here.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Issue</th>
                  <th>Address</th>
                  <th>Priority</th>
                  <th>Reported</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent || []).map((complaint) => (
                  <tr key={complaint.id}>
                    <td>#{complaint.id.slice(-6)}</td>
                    <td>{complaintTypeLabel(complaint)}</td>
                    <td>{complaint.address}</td>
                    <td>{complaint.priority}</td>
                    <td>{formatDate(complaint.createdAt)}</td>
                    <td><StatusBadge status={complaint.status} /></td>
                    <td>
                      <Link className="small-button" to={`/officer/complaints?id=${complaint.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
