import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ComplaintCard from "../components/ComplaintCard";
import { CategorySelect, IssueSelect } from "../components/ComplaintCategoryFields";
import { useService } from "../hooks/useService";
import { STATUS_LIST } from "../shared/constants";
import { call } from "../utils/api";

/**
 * One list component serves both /complaints and /my-complaints: the `scope`
 * prop only changes which records the service returns, never the markup.
 */
export default function Complaints({ scope = "all" }) {
  const mine = scope === "mine";
  const location = useLocation();
  const [filters, setFilters] = useState({
    status: "",
    complaintCategory: "",
    complaintType: "",
    search: "",
  });
  const [page, setPage] = useState(1);

  const load = useCallback(
    () =>
      call("listComplaints", {
        scope,
        page,
        limit: 9,
        status: filters.status,
        complaintCategory: filters.complaintCategory,
        complaintType: filters.complaintType,
        search: filters.search,
      }),
    [scope, page, filters]
  );

  const { data, loading, error } = useService(load);

  // Any filter change should take the reader back to the first page.
  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.complaintCategory, filters.complaintType, filters.search, scope]);

  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const updateCategory = (complaintCategory) =>
    setFilters((current) => ({ ...current, complaintCategory, complaintType: "" }));
  const items = data?.items || [];
  const statusCounts = data?.statusCounts || {};
  const totalCount = Object.values(statusCounts).reduce((total, count) => total + count, 0);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{mine ? "My Complaints" : "All Complaints"}</h1>
          <p className="page-intro">
            {loading
              ? "Loading reports…"
              : mine
                ? `${totalCount} report${totalCount === 1 ? "" : "s"} you filed from this account.`
                : `${totalCount} report${totalCount === 1 ? "" : "s"} shared by residents.`}
          </p>
        </div>
        <Link className="button button-dark" to="/report">
          Report an issue <span aria-hidden="true">↗</span>
        </Link>
      </div>

      {location.state?.message && <p className="form-message" role="status">{location.state.message}</p>}

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search by issue, category, address or complaint id"
          value={filters.search}
          onChange={(event) => update("search", event.target.value)}
          aria-label="Search complaints"
        />

        <select
          value={filters.status}
          onChange={(event) => update("status", event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_LIST.map((status) => (
            <option key={status} value={status}>
              {status} ({statusCounts[status] || 0})
            </option>
          ))}
        </select>

        <CategorySelect value={filters.complaintCategory} onChange={updateCategory} />

        <IssueSelect
          category={filters.complaintCategory}
          value={filters.complaintType}
          onChange={(value) => update("complaintType", value)}
        />
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={filters.status === "" ? "chip chip-active" : "chip"}
          onClick={() => update("status", "")}
        >
          All · {totalCount}
        </button>
        {STATUS_LIST.map((status) => (
          <button
            key={status}
            type="button"
            className={filters.status === status ? "chip chip-active" : "chip"}
            onClick={() => update("status", status)}
          >
            {status} · {statusCounts[status] || 0}
          </button>
        ))}
      </div>

      {error && <p className="form-message" role="alert">{error}</p>}

      {!loading && items.length === 0 && (
        <p className="empty-state">
          {mine
            ? "You have not reported anything yet. Start with the issue closest to your home."
            : "No complaints match these filters yet."}
        </p>
      )}

      {items.map((item) => (
        <ComplaintCard key={item.id} complaint={item} />
      ))}

      {(data?.pages || 1) > 1 && (
        <div className="pager">
          <button type="button" className="button-ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            ← Previous
          </button>
          <span>Page {data.page} of {data.pages}</span>
          <button
            type="button"
            className="button-ghost"
            disabled={page >= (data?.pages || 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
