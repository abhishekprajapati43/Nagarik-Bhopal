/**
 * Dependency-free line chart for the complaint trend and monthly series.
 *
 * Points are plotted in a 0..100 x 0..40 viewBox so the SVG scales with its
 * container. `data` rows need `{ label, value }`; `secondary` draws an optional
 * muted second line (for example resolved totals).
 */
export default function TrendChart({
  data = [],
  secondary = null,
  emptyLabel = "No data yet",
  accent = "#214b3e",
  secondaryColor = "#b98a2e",
}) {
  if (!data.length) return <p className="empty-state">{emptyLabel}</p>;

  const width = 100;
  const height = 40;
  const values = data.map((row) => Number(row.value) || 0);
  const secondaryValues = secondary ? secondary.map((row) => Number(row.value) || 0) : [];
  const maximum = Math.max(1, ...values, ...secondaryValues);

  const point = (value, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - (value / maximum) * (height - 4) - 2;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  };

  const line = (rows) =>
    rows
      .map((row, index) => point(Number(row.value) || 0, index).join(","))
      .join(" ");

  const area = `${line(data)} ${width},${height} 0,${height}`;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Complaint trend">
        <line x1="0" y1={height} x2={width} y2={height} className="trend-axis" />
        <polygon points={area} fill={accent} opacity="0.08" />
        <polyline points={line(data)} fill="none" stroke={accent} strokeWidth="1.1" strokeLinejoin="round" />
        {secondary && (
          <polyline
            points={line(secondary)}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="0.9"
            strokeDasharray="2 1.5"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <div className="trend-labels">
        {data.map((row, index) => (
          <span key={`${row.label}-${index}`}>{row.label}</span>
        ))}
      </div>

      <div className="trend-legend">
        <span><i style={{ background: accent }} /> Complaints</span>
        {secondary && (
          <span><i style={{ background: secondaryColor }} /> Resolved</span>
        )}
        <small>Peak: {maximum}</small>
      </div>
    </div>
  );
}
