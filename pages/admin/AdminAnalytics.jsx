import { useCallback } from "react";
import BarChart from "../../components/BarChart";
import TrendChart from "../../components/TrendChart";
import { useService } from "../../hooks/useService";
import { call } from "../../utils/api";

/**
 * Operational analytics: monthly/daily volume, category and ward mix,
 * resolution-time buckets, officer performance and the cumulative trend.
 */
export default function AdminAnalytics() {
  const load = useCallback(() => call("analytics"), []);
  const { data, loading, error } = useService(load);

  const totals = data?.totals;
  const officerRows = data?.byOfficer || [];

  return (
    <>
      {error && <p className="form-message" role="alert">{error}</p>}

      <section className="admin-card">
        <h2>
          Key numbers
          <small>{loading ? "Loading…" : `SLA target: ${totals?.slaDays} days`}</small>
        </h2>

        <div className="admin-stats">
          <div className="metric">
            <span>Total complaints</span>
            <b>{totals?.complaints ?? "—"}</b>
          </div>
          <div className="metric">
            <span>Resolution rate</span>
            <b>{totals?.resolutionRate ?? 0}%</b>
          </div>
          <div className="metric">
            <span>Avg. days to close</span>
            <b>{totals?.averageResolutionDays ?? 0}</b>
          </div>
          <div className="metric">
            <span>Open right now</span>
            <b>{(totals?.pending ?? 0) + (totals?.inProgress ?? 0)}</b>
          </div>
          <div className="metric">
            <span>Accepted</span>
            <b>{totals?.accepted ?? 0}</b>
          </div>
          <div className="metric">
            <span>Assigned</span>
            <b>{totals?.assigned ?? 0}</b>
          </div>
          <div className="metric">
            <span>Residents</span>
            <b>{totals?.users ?? 0}</b>
          </div>
          <div className="metric">
            <span>Community votes</span>
            <b>{totals?.upvotes ?? 0}</b>
          </div>
        </div>
      </section>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>Monthly complaints <small>Last 12 months</small></h2>
          <TrendChart
            data={data?.byMonth || []}
            secondary={(data?.byMonth || []).map((row) => ({ label: row.label, value: row.resolved }))}
          />
        </section>

        <section className="admin-card">
          <h2>Daily complaints <small>Last 14 days</small></h2>
          <BarChart data={data?.byDay || []} accent emptyLabel="No complaints yet" />
        </section>
      </div>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>By status</h2>
          <BarChart data={data?.byStatus || []} accent />
        </section>

        <section className="admin-card">
          <h2>By complaint category</h2>
          <BarChart data={data?.byCategory || []} emptyLabel="No complaints yet" />
        </section>
      </div>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>Resolution time</h2>
          <BarChart data={data?.resolutionBuckets || []} accent emptyLabel="No resolved complaints yet" />
        </section>

        <section className="admin-card">
          <h2>Complaint trend <small>Cumulative 12 months</small></h2>
          <TrendChart data={data?.trend || []} emptyLabel="No complaints yet" />
        </section>
      </div>

      <section className="admin-card">
        <h2>
          Officer performance
          <small>Assigned · resolved · average days</small>
        </h2>

        {officerRows.length === 0 ? (
          <p className="admin-empty">No sanitation officers configured.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Officer</th>
                  <th>Zone</th>
                  <th>Assigned</th>
                  <th>Pending</th>
                  <th>In progress</th>
                  <th>Resolved</th>
                  <th>Avg. days</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {officerRows.map((officer) => (
                  <tr key={officer.id}>
                    <td>{officer.label}</td>
                    <td>{officer.zone || "—"}</td>
                    <td>{officer.value}</td>
                    <td>{officer.pending}</td>
                    <td>{officer.inProgress}</td>
                    <td>{officer.resolved}</td>
                    <td>{officer.averageDays}</td>
                    <td>
                      <span className="load-bar">
                        <span
                          style={{
                            width: `${Math.min(
                              100,
                              officer.value
                                ? Math.max(4, Math.round((officer.resolved / officer.value) * 100))
                                : 0
                            )}%`,
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>Reports received · last 7 days</h2>
          <BarChart data={data?.lastSevenDays || []} accent />
        </section>

        <section className="admin-card">
          <h2>Garbage by waste type</h2>
          <BarChart data={data?.byWaste || []} emptyLabel="No complaints yet" />
        </section>
      </div>

      <section className="admin-card">
        <h2>
          Ward-wise performance
          <small>Total · pending · resolved · average days · top category</small>
        </h2>

        {loading && !data ? (
          <p className="admin-empty">Loading ward performance…</p>
        ) : (data?.byWard || []).length === 0 ? (
          <p className="admin-empty">No wards configured.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Area</th>
                  <th>Zone</th>
                  <th>Constituency</th>
                  <th>Total</th>
                  <th>Pending</th>
                  <th>Resolved</th>
                  <th>Avg. days</th>
                  <th>Top category</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byWard || []).map((ward) => (
                  <tr key={ward.id || ward.label}>
                    <td>{ward.wardNumber ? `Ward ${ward.wardNumber}` : ward.wardName || ward.label}</td>
                    <td>{ward.area || "—"}</td>
                    <td>{ward.zoneNumber ? `Zone ${ward.zoneNumber}` : "—"}</td>
                    <td>{ward.assemblyConstituency || "—"}</td>
                    <td>{ward.total ?? 0}</td>
                    <td>{ward.pending ?? 0}</td>
                    <td>{ward.resolved ?? 0}</td>
                    <td>{ward.averageResolutionDays ?? 0}</td>
                    <td>{ward.topCategory || "—"}</td>
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
