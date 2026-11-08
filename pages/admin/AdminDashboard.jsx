import { useCallback } from "react";
import { Link } from "react-router-dom";
import BarChart from "../../components/BarChart";
import StatsCard from "../../components/StatsCard";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { call } from "../../utils/api";
import { formatDate } from "../../utils/format";

export default function AdminDashboard() {
  const loadAnalytics = useCallback(() => call("analytics"), []);
  const { data, loading, error } = useService(loadAnalytics);

  const loadPending = useCallback(() => call("listComplaints", { status: "Pending", limit: 6 }), []);
  const { data: pending } = useService(loadPending);

  const totals = data?.totals;

  return (
    <>
      <div className="admin-card">
        <h2>
          Overview
          <small>{loading ? "Loading…" : `SLA ${totals?.slaDays ?? "—"} days`}</small>
        </h2>

        {error && <p className="form-message" role="alert">{error}</p>}

        <div className="admin-stats">
          <StatsCard title="Total Complaints" value={totals?.complaints ?? "—"} color="#2563eb" />
          <StatsCard title="Pending" value={totals?.pending ?? "—"} color="#f59e0b" />
          <StatsCard title="In Progress" value={totals?.inProgress ?? "—"} color="#dc2626" />
          <StatsCard title="Resolved" value={totals?.resolved ?? "—"} color="#16a34a" />
        </div>

        <div className="mini-stats">
          <span><b>{totals?.users ?? 0}</b> residents</span>
          <span><b>{totals?.wards ?? 0}</b> wards</span>
          <span><b>{totals?.representatives ?? 0}</b> representatives</span>
          <span><b>{totals?.upvotes ?? 0}</b> “me too” votes</span>
          <span><b>{totals?.resolutionRate ?? 0}%</b> resolution rate</span>
          <span><b>{totals?.averageResolutionDays ?? 0}</b> avg. days to close</span>
        </div>
      </div>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>Complaints by status</h2>
          <BarChart data={data?.byStatus || []} accent />
        </section>

        <section className="admin-card">
          <h2>Ward load</h2>
          <BarChart data={(data?.byWard || []).slice(0, 6)} emptyLabel="No complaints yet" />
        </section>
      </div>

      <section className="admin-card">
        <h2>
          Pending queue
          <small><Link to="/admin/complaints">Manage all →</Link></small>
        </h2>

        {(pending?.items || []).length === 0 ? (
          <p className="admin-empty">No complaints are waiting. Nice work.</p>
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
                </tr>
              </thead>
              <tbody>
                {pending.items.map((complaint) => (
                  <tr key={complaint.id}>
                    <td>
                      <Link to={`/complaint/${complaint.id}`}>#{complaint.id.slice(-6)}</Link>
                    </td>
                    <td>{complaint.userName}</td>
                    <td>{complaint.wasteType}</td>
                    <td>{complaint.ward}</td>
                    <td>{complaint.priority}</td>
                    <td>{complaint.days}</td>
                    <td><StatusBadge status={complaint.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>Most supported reports</h2>

        {(data?.topComplaints || []).length === 0 ? (
          <p className="admin-empty">No reports yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Waste</th>
                  <th>Ward</th>
                  <th>Votes</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {data.topComplaints.map((complaint) => (
                  <tr key={complaint.id}>
                    <td><Link to={`/complaint/${complaint.id}`}>#{complaint.id.slice(-6)}</Link></td>
                    <td>{complaint.wasteType}</td>
                    <td>{complaint.ward}</td>
                    <td>{complaint.upvotes}</td>
                    <td>{formatDate(complaint.createdAt)}</td>
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
