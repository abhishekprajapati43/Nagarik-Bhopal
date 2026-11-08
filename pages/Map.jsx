import { useCallback, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { useService } from "../hooks/useService";
import { STATUS_LIST } from "../shared/constants";
import { call } from "../utils/api";

delete L.Icon.Default.prototype._getIconUrl;

// Bundle the marker images with the app instead of fetching them from a CDN,
// so the map still works when the device is offline.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BHOPAL_CENTER = [23.2599, 77.4126];

export default function MapPage() {
  const [status, setStatus] = useState("");

  const load = useCallback(() => call("listComplaints", { limit: 50, status }), [status]);
  const { data, loading, error } = useService(load);

  const complaints = (data?.items || []).filter(
    (complaint) => Array.isArray(complaint.position) && complaint.position.length === 2
  );

  return (
    <div className="map-page">
      <div className="page-head">
        <div>
          <h1>Garbage Complaint Map</h1>
          <p className="page-intro">
            {loading ? "Loading map…" : `${complaints.length} geotagged report(s) in Bhopal.`}
          </p>
        </div>

        <select
          className="inline-select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter map by status"
        >
          <option value="">All statuses</option>
          {STATUS_LIST.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      {error && <p className="form-message" role="alert">{error}</p>}

      <MapContainer
        center={BHOPAL_CENTER}
        zoom={12}
        style={{ height: "600px", width: "100%", borderRadius: "12px" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {complaints.map((item) => (
          <Marker key={item.id} position={item.position}>
            <Popup>
              <h3>{item.wasteType}</h3>
              <p>{item.address}</p>
              <p>Status: {item.status}</p>
              <p>Pending Days: {item.days}</p>
              <p>👍 {item.upvotes} · 💬 {item.commentCount}</p>
              <StatusBadge status={item.status} />
              <p><Link to={`/complaint/${item.id}`}>View Details</Link></p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
