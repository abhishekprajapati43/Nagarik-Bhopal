import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import "./ComplaintCard.css";

export default function ComplaintCard({ complaint }) {
  return (
    <div className="complaint-card">
      {complaint.image ? (
        <img
          src={complaint.image}
          alt={`${complaint.wasteType} reported at ${complaint.address}`}
          loading="lazy"
        />
      ) : (
        <div className="complaint-no-image">No photo</div>
      )}

      <div className="complaint-body">
        <h3>{complaint.wasteType}</h3>
        <p>📍 {complaint.address}</p>
        <p>
          ⏳ {complaint.days} {complaint.days === 1 ? "Day" : "Days"} Pending
        </p>
        <p className="complaint-meta">
          {complaint.ward} · 👍 {complaint.upvotes} · 💬 {complaint.commentCount}
        </p>
        <StatusBadge status={complaint.status} />
        <Link className="complaint-link" to={`/complaint/${complaint.id}`}>
          <button type="button">View Details</button>
        </Link>
      </div>
    </div>
  );
}
