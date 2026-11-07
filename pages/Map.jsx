import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";
import { getComplaints } from "../utils/storage";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BHOPAL_CENTER = [23.2599, 77.4126];

export default function MapPage() {
  const complaints = getComplaints().filter(
    (complaint) => Array.isArray(complaint.position) && complaint.position.length === 2
  );

  return (
    <div className="map-page">
      <h1>Garbage Complaint Map</h1>

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
              <p>Status: {item.status}</p>
              <p>Pending Days: {item.days}</p>
              <Link to={`/complaint/${item.id}`}>View Details</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
