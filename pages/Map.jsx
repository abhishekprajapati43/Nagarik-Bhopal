import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Link } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import StatusBadge from "../components/StatusBadge";
import { useLanguage } from "../context/LanguageContext";
import { useService } from "../hooks/useService";
import { STATUS_LIST } from "../shared/constants";
import { call } from "../utils/api";
import { complaintCategoryName, complaintTypeLabel } from "../utils/complaint";

delete L.Icon.Default.prototype._getIconUrl;

// Bundle the marker images with the app instead of fetching them from a CDN,
// so the map still works when the device is offline.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BHOPAL_CENTER = [23.2599, 77.4126];
const HEAT_REFRESH_MS = 30_000;

const HEAT_LEVELS = [
  { id: "low", color: "#16a34a", label: "Low" },
  { id: "medium", color: "#f59e0b", label: "Medium" },
  { id: "high", color: "#dc2626", label: "High" },
];

/**
 * Green / yellow / red ward levels. Thresholds scale with the busiest ward so
 * the map stays readable as the complaint volume grows, and a ward with no
 * complaints is always green.
 */
const levelFor = (total, max) => {
  if (!total) return HEAT_LEVELS[0];
  const ratio = max > 0 ? total / max : 0;
  if (ratio > 0.66) return HEAT_LEVELS[2];
  if (ratio > 0.33) return HEAT_LEVELS[1];
  return HEAT_LEVELS[0];
};

const wardRadius = (total) => 380 + Math.min(Number(total) || 0, 25) * 28;

export default function MapPage() {
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("heat");
  const { t } = useLanguage();

  const loadHeat = useCallback(() => call("wardHeatmap"), []);
  const { data: heatData, loading: heatLoading, error: heatError, refresh: refreshHeat } =
    useService(loadHeat, { live: false });

  const load = useCallback(() => call("listComplaints", { limit: 200, status }), [status]);
  const { data, loading, error } = useService(load, { live: false });

  const complaints = useMemo(
    () =>
      (data?.items || []).filter(
        (complaint) => Array.isArray(complaint.position) && complaint.position.length === 2
      ),
    [data]
  );

  const wardRows = useMemo(
    () =>
      (heatData?.items || []).filter(
        (ward) =>
          Array.isArray(ward.center) &&
          ward.center.length === 2 &&
          Number.isFinite(Number(ward.center[0])) &&
          Number.isFinite(Number(ward.center[1]))
      ),
    [heatData]
  );

  const maxTotal = useMemo(
    () => wardRows.reduce((highest, ward) => Math.max(highest, Number(ward.total) || 0), 0),
    [wardRows]
  );

  const totalComplaints = useMemo(
    () => wardRows.reduce((sum, ward) => sum + (Number(ward.total) || 0), 0),
    [wardRows]
  );

  // Keep the ward heat levels fresh even when another tab or a background
  // process records a complaint.
  useEffect(() => {
    const timer = window.setInterval(() => refreshHeat(), HEAT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshHeat]);

  const activeError = heatError || error;
  const activeLoading = heatLoading || loading;

  return (
    <div className="map-page">
      <div className="page-head">
        <div>
          <h1>{t("map.title")}</h1>
          <p className="page-intro">
            {activeLoading
              ? t("common.loading")
              : `${wardRows.length} wards · ${totalComplaints} complaints`}
          </p>
        </div>

        <div className="map-controls">
          <LanguageSwitcher compact />

          <div className="map-mode" role="group" aria-label={t("map.heatmap")}>
            <button
              type="button"
              className={mode === "heat" ? "map-mode-active" : ""}
              onClick={() => setMode("heat")}
            >
              {t("map.heatmap")}
            </button>
            <button
              type="button"
              className={mode === "markers" ? "map-mode-active" : ""}
              onClick={() => setMode("markers")}
            >
              {t("map.markers")}
            </button>
          </div>

          <select
            className="inline-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label={t("common.status")}
            disabled={mode === "heat"}
          >
            <option value="">{t("common.allStatuses")}</option>
            {STATUS_LIST.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      {activeError && <p className="form-message" role="alert">{activeError}</p>}

      <div className="heat-legend" aria-label={t("map.legend")}>
        <b>{t("map.legend")}:</b>
        {HEAT_LEVELS.map((level) => (
          <span key={level.id}>
            <i style={{ background: level.color }} aria-hidden="true" />
            {level.label}
          </span>
        ))}
        <small>
          {wardRows.length} wards · {totalComplaints} complaints
          {heatData?.updatedAt ? ` · updated ${new Date(heatData.updatedAt).toLocaleTimeString()}` : ""}
        </small>
      </div>

      <MapContainer
        center={BHOPAL_CENTER}
        zoom={12}
        style={{ height: "600px", width: "100%", borderRadius: "12px" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mode === "heat" &&
          wardRows.map((ward) => {
            const level = levelFor(Number(ward.total) || 0, maxTotal);

            return (
              <Circle
                key={ward.id}
                center={[Number(ward.center[0]), Number(ward.center[1])]}
                radius={wardRadius(ward.total)}
                pathOptions={{
                  color: level.color,
                  fillColor: level.color,
                  fillOpacity: 0.34,
                  weight: 1,
                }}
              >
                <Popup>
                  <h3>
                    {ward.wardNumber ? `Ward ${ward.wardNumber}` : ward.wardName}
                    {ward.wardNumber ? ` · ${ward.wardName}` : ""}
                  </h3>
                  <p>{ward.area || "—"}{ward.zoneNumber ? ` · Zone ${ward.zoneNumber}` : ""}</p>
                  <p>
                    <b>{ward.total}</b> complaint(s) · {ward.pending} pending · {ward.resolved} resolved
                  </p>
                  <p>{level.label} complaint level</p>
                </Popup>
              </Circle>
            );
          })}

        {mode === "markers" &&
          complaints.map((item) => (
            <Marker key={item.id} position={item.position}>
              <Popup>
                <h3>{complaintTypeLabel(item)}</h3>
                <p>{complaintCategoryName(item)}</p>
                <p>{item.address}</p>
                <p>
                  {t("common.status")}: <StatusBadge status={item.status} />
                </p>
                <p>{t("common.days", { count: item.days })}</p>
                <p>👍 {item.upvotes} · 💬 {item.commentCount}</p>
                <p><Link to={`/complaint/${item.id}`}>{t("map.viewDetails")}</Link></p>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
