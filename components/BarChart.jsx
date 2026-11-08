/**
 * Dependency-free horizontal bar chart. Used by the admin dashboard and the
 * analytics page so both read the same numbers the same way.
 */
export default function BarChart({ data = [], emptyLabel = "No data yet", accent = false }) {
  const maximum = Math.max(1, ...data.map((row) => Number(row.value) || 0));

  if (data.length === 0) return <p className="empty-state">{emptyLabel}</p>;

  return (
    <div className="bar-chart">
      {data.map((row) => {
        const value = Number(row.value) || 0;
        const width = Math.round((value / maximum) * 100);

        return (
          <div className="bar-row" key={row.label}>
            <span className="bar-label" title={row.label}>
              {row.label}
            </span>
            <span className="bar-track">
              <span
                className={accent ? "bar-fill bar-fill-accent" : "bar-fill"}
                style={{ width: `${value === 0 ? 0 : Math.max(width, 4)}%` }}
              />
            </span>
            <span className="bar-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
