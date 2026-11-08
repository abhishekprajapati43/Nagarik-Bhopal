import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useService } from "../hooks/useService";
import { PRIORITY_LIST, WASTE_TYPES, findNearestWard } from "../shared/constants";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { prepareImage } from "../utils/image";

const emptyForm = {
  wasteType: "",
  description: "",
  address: "",
  image: "",
  priority: "Medium",
  wardId: "",
  latitude: "",
  longitude: "",
  accuracy: "",
};

export default function ReportComplaint() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);
  const wards = wardsData?.items || [];

  // Start from the ward saved on the profile so most reports need no edits.
  useEffect(() => {
    if (!user?.wardId) return;
    setFormData((current) => (current.wardId ? current : { ...current, wardId: user.wardId }));
  }, [user?.wardId]);

  const update = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      setMessage("This browser cannot share your location. Pick your ward manually.");
      return;
    }

    setLocating(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(5));
        const longitude = Number(position.coords.longitude.toFixed(5));
        const nearest = findNearestWard(latitude, longitude);

        setFormData((current) => ({
          ...current,
          latitude: String(latitude),
          longitude: String(longitude),
          accuracy: String(Math.round(position.coords.accuracy)),
          wardId: current.wardId || nearest?.id || "",
        }));

        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Pick your ward manually or allow access in the browser."
            : "We could not read your location. Pick your ward manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleImage = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setPreparingImage(true);
    setMessage("");

    try {
      const dataUrl = await prepareImage(file);
      update("image", dataUrl);
    } catch (error) {
      setMessage(messageFor(error));
      event.target.value = "";
    } finally {
      setPreparingImage(false);
    }
  };

  const submitComplaint = async (event) => {
    event.preventDefault();

    if (!formData.wasteType) {
      setMessage("Choose the type of waste you are reporting.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const result = await call("createComplaint", {
        wasteType: formData.wasteType,
        description: formData.description,
        address: formData.address,
        priority: formData.priority,
        wardId: formData.wardId,
        image: formData.image,
        position:
          formData.latitude && formData.longitude
            ? [Number(formData.latitude), Number(formData.longitude)]
            : null,
      });

      setFormData(emptyForm);
      navigate(`/complaint/${result.complaint.id}`);
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <h1>Report Garbage</h1>
      <p className="page-intro">
        Add a photo and the location so the right ward team can act on it quickly.
      </p>

      <form onSubmit={submitComplaint} className="report-form" noValidate>
        <div className="field-grid">
          <label>Waste type
            <select
              required
              value={formData.wasteType}
              onChange={(event) => update("wasteType", event.target.value)}
            >
              <option value="">Select waste</option>
              {WASTE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>Priority
            <select
              value={formData.priority}
              onChange={(event) => update("priority", event.target.value)}
            >
              {PRIORITY_LIST.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>

        <label>Ward
          <select
            value={formData.wardId}
            onChange={(event) => update("wardId", event.target.value)}
          >
            <option value="">Detect from my location</option>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
            ))}
          </select>
        </label>

        <label>Address / landmark
          <input
            required
            minLength="5"
            maxLength="160"
            placeholder="e.g. MP Nagar Zone-1, near the bus stop"
            value={formData.address}
            onChange={(event) => update("address", event.target.value)}
          />
        </label>

        <label>Description
          <textarea
            required
            rows="5"
            minLength="10"
            maxLength="600"
            placeholder="Describe the problem..."
            value={formData.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </label>

        <label>Photo
          <input type="file" accept="image/*" onChange={handleImage} />
        </label>
        <p className="label-hint">Photos are resized on this device before saving.</p>

        {preparingImage && <p className="page-intro">Preparing photo…</p>}

        {formData.image && (
          <div className="photo-preview">
            <img src={formData.image} alt="Attached complaint" />
            <button type="button" className="button-ghost" onClick={() => update("image", "")}>
              Remove photo
            </button>
          </div>
        )}

        <div className="location-actions">
          <button type="button" onClick={getLocation} disabled={locating}>
            {locating ? "Locating…" : "Use my current location"}
          </button>
          {formData.latitude && (
            <span className="location-note">
              GPS saved{formData.accuracy ? ` · ±${formData.accuracy} m` : ""}
            </span>
          )}
        </div>

        <div className="location-fields">
          <input readOnly placeholder="Latitude" value={formData.latitude} aria-label="Latitude" />
          <input readOnly placeholder="Longitude" value={formData.longitude} aria-label="Longitude" />
        </div>

        {message && <p className="form-message" role="alert">{message}</p>}

        <button type="submit" disabled={submitting || preparingImage}>
          {submitting ? "Submitting…" : "Submit complaint"}
        </button>
      </form>
    </div>
  );
}
