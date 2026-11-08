import { useCallback } from "react";
import BarChart from "../../components/BarChart";
import { useService } from "../../hooks/useService";
import { call } from "../../utils/api";

export default function AdminAnalytics() {
  const load = useCallback(() => call("analytics"), []);
  const { data, loading, error } = useService(load);

  const totals = data?.totals;

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
          <h2>By status</h2>
          <BarChart data={data?.byStatus || []} accent />
        </section>

        <section className="admin-card">
          <h2>By waste type</h2>
          <BarChart data={data?.byWaste || []} emptyLabel="No complaints yet" />
        </section>
      </div>

      <section className="admin-card">
        <h2>
          Ward performance
          <small>Red bars mean a heavier load</small>
        </h2>
        <BarChart data={data?.byWard || []} emptyLabel="No wards configured" />
      </section>

      <section className="admin-card">
        <h2>Reports received · last 7 days</h2>
        <BarChart data={data?.lastSevenDays || []} accent />
      </section>
    </>
  );
}
