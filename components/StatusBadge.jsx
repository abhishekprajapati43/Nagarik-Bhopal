import { statusClass } from "../shared/constants";
import { useLanguage } from "../context/LanguageContext";

/**
 * Status pill shared by complaint cards, details and the admin tables.
 * The stored value stays English; only the visible label is translated.
 */
export default function StatusBadge({ status }) {
  const { t } = useLanguage();
  const value = status || "Pending";

  return (
    <span className={`status ${statusClass(value)}`} title={value}>
      {t(`status.${value}`)}
    </span>
  );
}
