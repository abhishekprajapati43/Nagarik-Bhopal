import { useCallback } from "react";
import { Link } from "react-router-dom";
import StatsCard from "../../components/StatsCard";
import StatusBadge from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useService } from "../../hooks/useService";
import { call } from "../../utils/api";
import { complaintTypeLabel } from "../../utils/complaint";
import { formatDate, timeAgo } from "../../utils/format";

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "neighbour";

/** Resident home inside the dashboard shell. Mirrors the admin overview cards. */
export default function UserDashboard() {
  const { user } = useAuth();
  const loadStats = useCallback(() => call("myStats"), []);
  const { data, loading, error } = useService(loadStats);

  const loadNotifications = useCallback(() => call("listNotifications"), []);
  const { data: notifications, loading: noticesLoading } = useService(loadNotifications);

  const announcements = (notifications?.items || [])
    .filter((item) => item.type === "broadcast")
    .slice(0, 4);

  return (
    <>
      <section className="admin-card user-welcome">
        <div>
          <p className="eyebrow eyebrow-dark">RESIDENT WORKSPACE</p>
          <h2>Welcome back, {firstName(user?.name)}</h2>
          <p className="admin-note">
            Everything you have reported, and what the city is doing about it, in one place.
          </p>
        </div>
        <Link className="button button-dark" to="/report">
          Report an issue <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="admin-card">
        <h2>
          Overview
          <small>{loading ? "Loading…" : "Your complaint activity"}</small>
        </h2>

        {error && <p className="form-message" role="alert">{error}</p>}

        <div className="admin-stats">
          <StatsCard title="Total Complaints" value={data?.total ?? "—"} color="#2563eb" />
          <StatsCard title="Pending" value={data?.pending ?? "—"} color="#f59e0b" />
          <StatsCard title="In Progress" value={data?.inProgress ?? "—"} color="#dc2626" />
          <StatsCard title="Resolved" value={data?.resolved ?? "—"} color="#16a34a" />
        </div>

        <div className="mini-stats user-mini-stats">
          <span><b>{data?.upvotesReceived ?? 0}</b> “me too” votes received</span>
          <span><b>{data?.averageDays ?? 0}</b> avg. days to resolve</span>
          <span><b>{data?.rejected ?? 0}</b> closed as rejected</span>
          <span><b>{notifications?.unread ?? 0}</b> unread updates</span>
        </div>
      </section>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2>
            Recent Complaint Activity
            <small><Link to="/my-complaints">View all →</Link></small>
          </h2>

          {(data?.recent || []).length === 0 ? (
            <p className="admin-empty">
              No reports yet. <Link to="/report">Report the first issue</Link> on your street.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Issue</th>
                    <th>Ward</th>
                    <th>Status</th>
                    <th>Days</th>
                    <th>Reported</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((complaint) => (
                    <tr key={complaint.id}>
                      <td>#{complaint.id.slice(-6)}</td>
                      <td>{complaintTypeLabel(complaint)}</td>
                      <td>{complaint.ward}</td>
                      <td><StatusBadge status={complaint.status} /></td>
                      <td>{complaint.days}</td>
                      <td>{formatDate(complaint.createdAt)}</td>
                      <td><Link to={`/complaint/${complaint.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-card">
          <h2>
            Latest Announcements
            <small><Link to="/notifications">All updates →</Link></small>
          </h2>

          {noticesLoading ? (
            <p className="admin-empty">Loading announcements…</p>
          ) : announcements.length === 0 ? (
            <p className="admin-empty">No city announcements yet.</p>
          ) : (
            <ul className="user-announcement-list">
              {announcements.map((item) => (
                <li className="user-announcement" key={item.id}>
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                  <small>{timeAgo(item.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
