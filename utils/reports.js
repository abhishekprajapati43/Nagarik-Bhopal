import { jsPDF } from "jspdf";
import { formatDate } from "./format";

/**
 * CSV/PDF generation for the admin reports screen.
 *
 * The PDF is drawn directly with jsPDF (no table plugin) so the bundled file
 * stays small and works offline. Columns use the same `{ label, value(row) }`
 * shape as `downloadCsv`, which keeps both exports in sync.
 */

const PAGE = { width: 210, height: 297, margin: 14 };
const HEADER_HEIGHT = 9;
const ROW_HEIGHT = 7;

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const fit = (doc, value, maxWidth) => {
  const line = doc.splitTextToSize(text(value), maxWidth)[0] || "";
  if (line.length <= 0) return "";
  // splitTextToSize already wraps; drop a trailing partial word marker.
  return line;
};

export function downloadPdfReport({
  filename = "nagarik-report.pdf",
  title = "Nagarik Bhopal report",
  subtitle = "",
  columns = [],
  rows = [],
  meta = [],
  orientation = "portrait",
}) {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE.margin * 2;
  const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
  const widths = columns.map(
    (column) => ((column.weight || 1) / totalWeight) * usableWidth
  );

  let y = PAGE.margin;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(33, 75, 62);
    doc.text(title, PAGE.margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 100, 95);

    if (subtitle) {
      doc.text(subtitle, PAGE.margin, y);
      y += 5;
    }

    for (const line of meta) {
      doc.text(line, PAGE.margin, y);
      y += 4.2;
    }

    y += 3;

    doc.setFillColor(33, 75, 62);
    doc.rect(PAGE.margin, y, usableWidth, HEADER_HEIGHT, "F");
    doc.setTextColor(246, 243, 234);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);

    let x = PAGE.margin + 2;
    columns.forEach((column, index) => {
      doc.text(fit(doc, column.label, widths[index] - 4), x, y + 5.8);
      x += widths[index];
    });

    y += HEADER_HEIGHT;
  };

  const drawFooter = (page) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 128, 123);
    doc.text(
      `Generated ${formatDate(new Date().toISOString())} · Nagarik Bhopal · Page ${page}`,
      PAGE.margin,
      pageHeight - 8
    );
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  let page = 1;

  if (rows.length === 0) {
    doc.setTextColor(120, 128, 123);
    doc.text("No records for this selection.", PAGE.margin, y + 6);
  }

  rows.forEach((row, rowIndex) => {
    if (y + ROW_HEIGHT > pageHeight - 16) {
      drawFooter(page);
      doc.addPage();
      page += 1;
      y = PAGE.margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
    }

    if (rowIndex % 2 === 0) {
      doc.setFillColor(246, 243, 234);
      doc.rect(PAGE.margin, y, usableWidth, ROW_HEIGHT, "F");
    }

    doc.setTextColor(61, 74, 68);

    let x = PAGE.margin + 2;
    columns.forEach((column, index) => {
      doc.text(fit(doc, column.value(row), widths[index] - 4), x, y + 4.7);
      x += widths[index];
    });

    y += ROW_HEIGHT;
  });

  drawFooter(page);
  doc.save(filename);
}

/* ----------------------------- report builders ------------------------- */

export const complaintReportColumns = (complaintCategoryName, complaintTypeLabel) => [
  { label: "ID", weight: 0.9, value: (row) => `#${String(row.id).slice(-6).toUpperCase()}` },
  { label: "Date", weight: 1.1, value: (row) => formatDate(row.createdAt) },
  { label: "Reporter", weight: 1.4, value: (row) => row.userName },
  { label: "Category", weight: 1.4, value: (row) => complaintCategoryName(row) },
  { label: "Issue", value: (row) => complaintTypeLabel(row) },
  { label: "Ward", weight: 1.1, value: (row) => row.ward },
  { label: "Address", weight: 2, value: (row) => row.address },
  { label: "Officer", weight: 1.2, value: (row) => row.assignedOfficer || "—" },
  { label: "Status", weight: 1.1, value: (row) => row.status },
  { label: "Days", weight: 0.6, value: (row) => row.days },
];

export const wardReportColumns = [
  { label: "Ward", weight: 1.1, value: (row) => row.name },
  { label: "Area", weight: 1.5, value: (row) => row.area },
  { label: "Zone", weight: 0.9, value: (row) => row.zone },
  { label: "Corporator", weight: 1.6, value: (row) => row.representative || "—" },
  { label: "Officer", weight: 1.6, value: (row) => row.assignedOfficer || "—" },
  { label: "Total", weight: 0.6, value: (row) => row.complaints },
  { label: "Resolved", weight: 0.8, value: (row) => row.resolved },
  { label: "Open", weight: 0.6, value: (row) => Math.max(0, (row.complaints || 0) - (row.resolved || 0)) },
];

export const monthlyReportColumns = [
  { label: "Month", weight: 1.4, value: (row) => row.label },
  { label: "Received", weight: 0.9, value: (row) => row.value },
  { label: "Resolved", weight: 0.9, value: (row) => row.resolved },
  { label: "Open", weight: 0.7, value: (row) => Math.max(0, row.value - row.resolved) },
  {
    label: "Resolution %",
    weight: 1,
    value: (row) => (row.value ? `${Math.round((row.resolved / row.value) * 100)}%` : "0%"),
  },
];

export const wardReportRows = (wards = []) => wards;
export const monthlyReportRows = (byMonth = []) => byMonth;
