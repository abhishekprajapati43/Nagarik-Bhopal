import "./StatsCard.css";

export default function StatsCard({
  title,
  value,
  color
}) {
  return (
    <div
      className="stats-card"
      style={{ borderTop: `6px solid ${color}` }}
    >
      <h3>{title}</h3>

      <h1>{value}</h1>
    </div>
  );
}