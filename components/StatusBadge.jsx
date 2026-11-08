import { statusClass } from "../shared/constants";

/** Status pill shared by complaint cards, details and the admin tables. */
export default function StatusBadge({ status }) {
  return <span className={`status ${statusClass(status)}`}>{status}</span>;
}
