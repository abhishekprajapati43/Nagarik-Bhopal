import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { STATUS_LIST } from "../../shared/constants";
import { call } from "../../utils/api";
import { formatDate } from "../../utils/format";

const matches = (complaint, term) => {
  // Accept both the full reference and the short "#abc123" form shown in the
  // table, with or without the leading hash.
  const needle = term.replace(/^#/, "");
  return [
    complaint.id,
    String(complaint.id).slice(-6),
    complaint.wasteType,
    complaint.ward,
    complaint.address,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
};

/** Dedicated tracking view: search a report or browse by its current stage. */
export default function UserComplaintStatus() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(() => call("listComplaints", { scope: "mine", limit: 200 }), []);
  const { data, loading, error } = useService(load);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.items || [])
      .filter((complaint) => (status ? complaint.status === status : true))
      .filter((complaint) => (term ? matches(complaint, term) : true));
  }, [data, search, status]);

  const statusCounts = data?.statusCounts || {};
  const total = data?.total || 0;

  return (
    <>
      <section className="admin-card user-welcome">
        <div>
          <p className="eyebrow eyebrow-dark">TRACK EVERY STEP</p>
          <h2>Complaint Status</h2>
          <p className="admin-note">
            Search by complaint ID, ward or address, or filter the reports by their current stage.
          </p>
        </div>
        <Link className="button button-dark" to="/report">
          New complaint <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="admin-card">
        <h2>
          Your reports
          <small>{loading ? "Loading…" : `${total} report${total === 1 ? "" : "s"} filed`}</small>
        </h2>

        {error && <p className="form-message" role="alert">{error}</p>}

        <div className="admin-toolbar">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by complaint ID, ward or address"
            aria-label="Search your complaints"
          />
        </div>

        <div className="chip-row">
          <button
            type="button"
            className={status === "" ? "chip chip-active" : "chip"}
            onClick={() => setStatus("")}
          >
            All · {total}
          </button>
          {STATUS_LIST.map((value) => (
            <button
              key={value}
              type="button"
              className={status === value ? "chip chip-active" : "chip"}
              onClick={() => setStatus(value)}
            >
              {value} · {statusCounts[value] || 0}
            </button>
          ))}
        </div>

        {!loading && items.length === 0 ? (
          <p className="admin-empty">
            {total === 0
              ? "You have not reported anything yet."
              : "No reports match this search or filter."}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Waste</th>
                  <th>Ward</th>
                  <th>Status</th>
                  <th>Days</th>
                  <th>Last update</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((complaint) => (
                  <tr key={complaint.id}>
                    <td>#{complaint.id.slice(-6)}</td>
                    <td>{complaint.wasteType}</td>
                    <td>{complaint.ward}</td>
                    <td><StatusBadge status={complaint.status} /></td>
                    <td>{complaint.days}</td>
                    <td>{formatDate(complaint.updatedAt)}</td>
                    <td><Link to={`/complaint/${complaint.id}`}>View</Link></td>
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
