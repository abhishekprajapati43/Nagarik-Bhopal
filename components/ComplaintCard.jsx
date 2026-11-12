import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import { useLanguage } from "../context/LanguageContext";
import { complaintCategoryName, complaintTypeLabel } from "../utils/complaint";
import "./ComplaintCard.css";

export default function ComplaintCard({ complaint }) {
  const { t } = useLanguage();

  return (
    <div className="complaint-card">
      {complaint.image ? (
        <img
          src={complaint.image}
          alt={`${complaintTypeLabel(complaint)} reported at ${complaint.address}`}
          loading="lazy"
        />
      ) : (
        <div className="complaint-no-image">{t("card.noPhoto")}</div>
      )}

      <div className="complaint-body">
        <h3>{complaintTypeLabel(complaint)}</h3>
        <p className="complaint-category">{complaintCategoryName(complaint)}</p>
        <p>📍 {complaint.address}</p>
        <p>
          ⏳ {complaint.days} {complaint.days === 1 ? t("common.day", { count: 1 }) : t("common.days", { count: complaint.days })}
        </p>
        <p className="complaint-meta">
          {complaint.ward} · 👍 {complaint.upvotes} · 💬 {complaint.commentCount}
        </p>
        <StatusBadge status={complaint.status} />
        <Link className="complaint-link" to={`/complaint/${complaint.id}`}>
          <button type="button">{t("card.viewDetails")}</button>
        </Link>
      </div>
    </div>
  );
}
