import { useCallback, useMemo, useState } from "react";
import { CategorySelect, IssueSelect } from "../../components/ComplaintCategoryFields";
import StatusBadge from "../../components/StatusBadge";
import { useService } from "../../hooks/useService";
import { STATUS_LIST } from "../../shared/constants";
import { call } from "../../utils/api";
import { complaintCategoryName, complaintTypeLabel } from "../../utils/complaint";
import { downloadCsv, formatDate } from "../../utils/format";
import {
  complaintReportColumns,
  downloadPdfReport,
  monthlyReportColumns,
  monthlyReportRows,
  wardReportColumns,
  wardReportRows,
} from "../../utils/reports";

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

const REPORT_TYPES = [
  { id: "complaints", label: "Complaint report" },
  { id: "wards", label: "Ward report" },
  { id: "monthly", label: "Monthly report" },
];

const COLUMNS = [
  { label: "Complaint ID", value: (row) => row.id },
  { label: "Reported on", value: (row) => formatDate(row.createdAt) },
  { label: "Reporter", value: (row) => row.userName },
  { label: "Email", value: (row) => row.userEmail },
  { label: "Category", value: (row) => complaintCategoryName(row) },
  { label: "Issue type", value: (row) => complaintTypeLabel(row) },
  { label: "Ward", value: (row) => row.ward },
  { label: "Address", value: (row) => row.address },
  { label: "Priority", value: (row) => row.priority },
  { label: "Status", value: (row) => row.status },
  { label: "Officer", value: (row) => row.assignedOfficer },
  { label: "Days pending", value: (row) => row.days },
  { label: "Upvotes", value: (row) => row.upvotes },
  { label: "Representative", value: (row) => row.representative },
];

export default function AdminReports() {
  const [reportType, setReportType] = useState("complaints");
  const [filters, setFilters] = useState({
    from: monthAgo(),
    to: today(),
    status: "",
    complaintCategory: "",
    complaintType: "",
  });

  const load = useCallback(
    () =>
      call("listComplaints", {
        limit: 200,
        from: filters.from,
        to: filters.to,
        status: filters.status,
        complaintCategory: filters.complaintCategory,
        complaintType: filters.complaintType,
      }),
    [filters]
  );

  const { data, loading, error } = useService(load);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);

  const loadAnalytics = useCallback(() => call("analytics"), []);
  const { data: analyticsData } = useService(loadAnalytics);

  const items = data?.items || [];
  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const updateCategory = (complaintCategory) =>
    setFilters((current) => ({ ...current, complaintCategory, complaintType: "" }));

  // The preview and both exports share one column/row pair per report type.
  const report = useMemo(() => {
    if (reportType === "wards") {
      return {
        title: "Ward report",
        columns: wardReportColumns,
        rows: wardReportRows(wardsData?.items || []),
        csvColumns: [
          { label: "Ward", value: (row) => row.name },
          { label: "Area", value: (row) => row.area },
          { label: "Zone", value: (row) => row.zone },
          { label: "Corporator", value: (row) => row.representative },
          { label: "MLA", value: (row) => row.mlaName || "" },
          { label: "Office", value: (row) => row.officeAddress || "" },
          { label: "Officer", value: (row) => row.assignedOfficer },
          { label: "Complaints", value: (row) => row.complaints },
          { label: "Resolved", value: (row) => row.resolved },
        ],
      };
    }

    if (reportType === "monthly") {
      return {
        title: "Monthly report",
        columns: monthlyReportColumns,
        rows: monthlyReportRows(analyticsData?.byMonth || []),
        csvColumns: [
          { label: "Month", value: (row) => row.label },
          { label: "Received", value: (row) => row.value },
          { label: "Resolved", value: (row) => row.resolved },
        ],
      };
    }

    return {
      title: "Complaint report",
      columns: complaintReportColumns(complaintCategoryName, complaintTypeLabel),
      rows: items,
      csvColumns: COLUMNS,
    };
  }, [reportType, items, wardsData, analyticsData]);

  const subtitle =
    reportType === "complaints"
      ? `${formatDate(filters.from)} to ${formatDate(filters.to)}${
          filters.status ? ` · ${filters.status}` : ""
        }`
      : reportType === "wards"
        ? "Ward-wise complaint load and assigned representatives"
        : "Last 12 months of complaint volume";

  const exportCsv = () => {
    downloadCsv(
      `nagarik-${reportType}-${filters.from}-to-${filters.to}.csv`,
      report.csvColumns,
      report.rows
    );
  };

  const exportPdf = () => {
    downloadPdfReport({
      filename: `nagarik-${reportType}-${filters.from}-to-${filters.to}.pdf`,
      title: `Nagarik Bhopal · ${report.title}`,
      subtitle,
      columns: report.columns,
      rows: report.rows,
      meta: [
        `Records: ${report.rows.length}`,
        `Department: Bhopal Municipal Corporation`,
      ],
      orientation: reportType === "complaints" ? "landscape" : "portrait",
    });
  };

  return (
    <>
      <section className="admin-card">
        <h2>
          Reports
          <small>{loading ? "Loading…" : `${report.rows.length} record(s)`}</small>
        </h2>

        <div className="report-type">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className={reportType === type.id ? "report-type-active" : ""}
              onClick={() => setReportType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>

        {reportType === "complaints" && (
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

            <CategorySelect value={filters.complaintCategory} onChange={updateCategory} />

            <IssueSelect
              category={filters.complaintCategory}
              value={filters.complaintType}
              onChange={(value) => update("complaintType", value)}
            />
          </div>
        )}

        <div className="admin-toolbar">
          <button type="button" className="small-button" onClick={exportCsv} disabled={report.rows.length === 0}>
            Export CSV
          </button>
          <button type="button" className="small-button" onClick={exportPdf} disabled={report.rows.length === 0}>
            Export PDF
          </button>
        </div>

        {error && <p className="form-message" role="alert">{error}</p>}

        {report.rows.length === 0 ? (
          <p className="admin-empty">No records for this selection.</p>
        ) : reportType === "complaints" ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Reporter</th>
                  <th>Category</th>
                  <th>Issue</th>
                  <th>Ward</th>
                  <th>Officer</th>
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
                    <td>{complaintCategoryName(row)}</td>
                    <td>{complaintTypeLabel(row)}</td>
                    <td>{row.ward}</td>
                    <td>{row.assignedOfficer || "—"}</td>
                    <td>{row.priority}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.upvotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  {report.columns.map((column) => (
                    <th key={column.label}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={`${reportType}-${index}`}>
                    {report.columns.map((column) => (
                      <td key={column.label}>{column.value(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="admin-note">
        Exports include the address and contact details of the reporter, so share the file only with
        the ward team that needs it. PDF files are generated on this device.
      </p>
    </>
  );
}
