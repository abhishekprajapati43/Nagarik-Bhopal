import ComplaintCard from "../components/ComplaintCard";
import { getComplaints } from "../utils/storage";

export default function Complaints() {
  const complaints = getComplaints();

  return (
    <div className="container">
      <h1>All Complaints</h1>
      <p className="page-intro">{complaints.length} reports available in this browser.</p>

      {complaints.length === 0 ? (
        <p className="empty-state">No complaints yet. Report an issue to get started.</p>
      ) : (
        complaints.map((item) => <ComplaintCard key={item.id} complaint={item} />)
      )}
    </div>
  );
}
