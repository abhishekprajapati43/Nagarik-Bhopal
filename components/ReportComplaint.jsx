import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ComplaintCategoryFields from "./ComplaintCategoryFields";
import StatusBadge from "./StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useService } from "../hooks/useService";
import { detectWaste, imageFingerprint } from "../shared/ai";
import { PRIORITY_LIST } from "../shared/constants";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { prepareImage } from "../utils/image";

const wardLabel = (ward) =>
  [
    ward.wardNumber ? `Ward ${ward.wardNumber}` : ward.name,
    ward.name,
    ward.area,
  ]
    .filter((part, index, list) => part && list.indexOf(part) === index)
    .join(" · ");

/** Closest ward by centroid, computed from the ward master served by the API. */
const findNearestWard = (wards, latitude, longitude) => {
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const ward of wards) {
    const [lat, lng] = ward.center || [];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) continue;

    const distance = (Number(lat) - latitude) ** 2 + (Number(lng) - longitude) ** 2;
    if (distance < closestDistance) {
      closest = ward;
      closestDistance = distance;
    }
  }

  return closest;
};

const emptyForm = {
  complaintCategory: "",
  complaintType: "",
  description: "",
  address: "",
  image: "",
  imageFingerprint: "",
  priority: "Medium",
  wardId: "",
  latitude: "",
  longitude: "",
  accuracy: "",
};

export default function ReportComplaint() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ai, setAi] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [wardQuery, setWardQuery] = useState("");

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);
  const wards = wardsData?.items || [];
  const selectedWard = wards.find((ward) => ward.id === formData.wardId) || null;
  const filteredWards = useMemo(() => {
    const query = wardQuery.trim().toLowerCase();
    if (!query) return wards;

    const matches = wards.filter((ward) =>
      [
        ward.wardNumber ? `ward ${ward.wardNumber}` : "",
        ward.wardNumber,
        ward.name,
        ward.area,
        ward.zone,
        ward.zoneNumber ? `zone ${ward.zoneNumber}` : "",
        ward.assemblyConstituency,
        ward.councillorName,
        ward.councillorMobile,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );

    // Keep the current selection visible even while the search narrows down.
    if (selectedWard && !matches.some((ward) => ward.id === selectedWard.id)) {
      return [selectedWard, ...matches];
    }

    return matches;
  }, [wards, wardQuery, selectedWard]);
  const identityPending =
    user?.role === "user" && user?.verificationStatus !== "Verified";

  // Start from the ward saved on the profile so most reports need no edits.
  useEffect(() => {
    if (!user?.wardId) return;
    setFormData((current) => (current.wardId ? current : { ...current, wardId: user.wardId }));
  }, [user?.wardId]);

  const update = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const position = useMemo(
    () =>
      formData.latitude && formData.longitude
        ? [Number(formData.latitude), Number(formData.longitude)]
        : null,
    [formData.latitude, formData.longitude]
  );

  // Advisory AI check: text metadata only, so it never delays a submission.
  useEffect(() => {
    if (!formData.image) {
      setAi(null);
      return;
    }

    setAi(
      detectWaste({
        complaintCategory: formData.complaintCategory,
        complaintType: formData.complaintType,
        description: formData.description,
      })
    );
  }, [formData.image, formData.complaintCategory, formData.complaintType, formData.description]);

  // Nearby duplicates look at GPS and the image fingerprint, debounced while
  // the citizen is still typing.
  useEffect(() => {
    if (!formData.complaintCategory && !position && !formData.imageFingerprint) {
      setDuplicates([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCheckingDuplicates(true);

      try {
        const result = await call("checkDuplicates", {
          complaintCategory: formData.complaintCategory,
          complaintType: formData.complaintType,
          position,
          imageFingerprint: formData.imageFingerprint,
        });

        if (!cancelled) setDuplicates(result?.matches || []);
      } catch {
        if (!cancelled) setDuplicates([]);
      } finally {
        if (!cancelled) setCheckingDuplicates(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    formData.complaintCategory,
    formData.complaintType,
    formData.imageFingerprint,
    position,
  ]);

  const getLocation = () => {
    if (!navigator.geolocation) {
      setMessage("This browser cannot share your location. Pick your ward manually.");
      return;
    }

    setLocating(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (location) => {
        const latitude = Number(location.coords.latitude.toFixed(5));
        const longitude = Number(location.coords.longitude.toFixed(5));
        const nearest = findNearestWard(wards, latitude, longitude);

        setFormData((current) => ({
          ...current,
          latitude: String(latitude),
          longitude: String(longitude),
          accuracy: String(Math.round(location.coords.accuracy)),
          wardId: current.wardId || nearest?.id || "",
        }));

        setLocating(false);
      },
      (locationError) => {
        setLocating(false);
        setMessage(
          locationError.code === locationError.PERMISSION_DENIED
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
    setDuplicatesDismissed(false);

    try {
      const dataUrl = await prepareImage(file);
      setFormData((current) => ({
        ...current,
        image: dataUrl,
        imageFingerprint: imageFingerprint(dataUrl),
      }));
    } catch (error) {
      setMessage(messageFor(error));
      event.target.value = "";
    } finally {
      setPreparingImage(false);
    }
  };

  const meToo = async (match) => {
    setSubmitting(true);
    setMessage("");

    try {
      await call("upvoteComplaint", { id: match.id });
      navigate(`/complaint/${match.id}`);
    } catch (error) {
      setMessage(messageFor(error));
      setSubmitting(false);
    }
  };

  const submitComplaint = async (event) => {
    event.preventDefault();

    if (identityPending) {
      setMessage("Please complete Aadhaar verification before submitting a complaint.");
      return;
    }

    if (!formData.complaintCategory) {
      setMessage(t("report.chooseCategory"));
      return;
    }

    if (!formData.complaintType) {
      setMessage(t("report.chooseIssue"));
      return;
    }

    if (!formData.wardId) {
      setMessage("Select the ward where the issue is located.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const result = await call("createComplaint", {
        complaintCategory: formData.complaintCategory,
        complaintType: formData.complaintType,
        description: formData.description,
        address: formData.address,
        priority: formData.priority,
        wardId: formData.wardId,
        image: formData.image,
        imageFingerprint: formData.imageFingerprint,
        aiWasteType: ai?.available ? ai.wasteType : "",
        aiConfidence: ai?.available ? ai.confidence : null,
        position,
      });

      setFormData(emptyForm);
      navigate(`/complaint/${result.complaint.id}`);
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  };

  const visibleDuplicates = duplicatesDismissed ? [] : duplicates;

  return (
    <div className="container">
      <h1>{t("report.title")}</h1>
      <p className="page-intro">{t("report.intro")}</p>

      {identityPending && (
        <div className="identity-block" role="alert">
          <b>Please complete Aadhaar verification before submitting a complaint.</b>
          <p>
            Your Aadhaar is {user?.verificationStatus === "Rejected" ? "rejected" : "waiting for review"}.
            You can still track existing reports and notifications.
          </p>
          <Link className="button button-dark" to="/profile">Complete identity verification</Link>
        </div>
      )}

      <form onSubmit={submitComplaint} className="report-form" noValidate>
        <div className="field-grid">
          <ComplaintCategoryFields
            category={formData.complaintCategory}
            type={formData.complaintType}
            disabled={submitting}
            onChange={({ complaintCategory, complaintType }) =>
              setFormData((current) => ({ ...current, complaintCategory, complaintType }))
            }
          />

          <label>
            {t("report.priority")}
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

        <div className="ward-picker">
          <label>
            {t("report.ward")} <span aria-hidden="true">*</span>
            <input
              type="search"
              placeholder="Search by ward number, name, area, zone or councillor"
              value={wardQuery}
              onChange={(event) => setWardQuery(event.target.value)}
              aria-label="Search wards"
            />
          </label>

          <label>
            {t("report.ward")}
            <select
              required
              value={formData.wardId}
              onChange={(event) => update("wardId", event.target.value)}
            >
              <option value="">Select a ward</option>
              {filteredWards.map((ward) => (
                <option key={ward.id} value={ward.id}>{wardLabel(ward)}</option>
              ))}
            </select>
          </label>

          {wardQuery && filteredWards.length === 0 && (
            <p className="label-hint">No ward matches “{wardQuery}”.</p>
          )}
        </div>

        {selectedWard && (
          <div className="ward-info-card" aria-live="polite">
            <h3>
              {selectedWard.wardNumber
                ? `Ward ${selectedWard.wardNumber} · ${selectedWard.name}`
                : selectedWard.name}
            </h3>
            <div className="ward-info-grid">
              <div>
                <span>{t("details.area")}</span>
                <b>{selectedWard.area || "—"}</b>
              </div>
              <div>
                <span>{t("details.zone")}</span>
                <b>{selectedWard.zone || selectedWard.zoneNumber || "—"}</b>
              </div>
              <div>
                <span>{t("details.assemblyConstituency")}</span>
                <b>{selectedWard.assemblyConstituency || "—"}</b>
              </div>
              <div>
                <span>{t("details.councillor")}</span>
                <b>{selectedWard.councillorName || "—"}</b>
              </div>
              <div>
                <span>{t("details.councillorMobile")}</span>
                <b>
                  {selectedWard.councillorMobile ? (
                    <a href={`tel:${selectedWard.councillorMobile}`}>
                      {selectedWard.councillorMobile}
                    </a>
                  ) : (
                    "—"
                  )}
                </b>
              </div>
            </div>
            <p className="label-hint">
              Your complaint will be routed to this ward's sanitation officer. If the ward has
              no officer yet, the city admin team will assign one from the pending queue.
            </p>
          </div>
        )}

        <label>
          {t("report.address")}
          <input
            required
            minLength="5"
            maxLength="160"
            placeholder={t("report.addressPlaceholder")}
            value={formData.address}
            onChange={(event) => update("address", event.target.value)}
          />
        </label>

        <label>
          {t("report.description")}
          <textarea
            required
            rows="5"
            minLength="10"
            maxLength="600"
            placeholder={t("report.descriptionPlaceholder")}
            value={formData.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </label>

        <label>
          {t("report.photo")}
          <input type="file" accept="image/*" onChange={handleImage} />
        </label>
        <p className="label-hint">{t("report.photoHint")}</p>

        {preparingImage && <p className="page-intro">{t("report.preparing")}</p>}

        {formData.image && (
          <div className="photo-preview">
            <img src={formData.image} alt={t("report.photo")} />
            <button
              type="button"
              className="button-ghost"
              onClick={() =>
                setFormData((current) => ({
                  ...current,
                  image: "",
                  imageFingerprint: "",
                }))
              }
            >
              {t("report.removePhoto")}
            </button>
          </div>
        )}

        {formData.image && (
          <div className="ai-card">
            <h3>{t("details.ai")}</h3>
            {ai?.available ? (
              <p>
                {t("report.aiFound", { type: ai.wasteType })} ·{" "}
                {t("report.aiConfidence", { confidence: Math.round(ai.confidence * 100) })}
              </p>
            ) : (
              <p>{t("report.aiUnavailable")}</p>
            )}
          </div>
        )}

        {visibleDuplicates.length > 0 && (
          <div className="duplicate-card">
            <h3>{t("report.duplicates")}</h3>
            <p className="label-hint">{t("report.duplicatesHint")}</p>

            <ul className="duplicate-list">
              {visibleDuplicates.map((match) => (
                <li key={match.id}>
                  {match.image ? (
                    <img src={match.image} alt="" />
                  ) : (
                    <span className="duplicate-no-image" aria-hidden="true">📍</span>
                  )}

                  <div>
                    <b>#{String(match.id).slice(-6).toUpperCase()} · {match.complaintType}</b>
                    <p>{match.address}</p>
                    <small>
                      {match.ward}
                      {match.distanceKm !== null && match.distanceKm !== undefined
                        ? ` · ${match.distanceKm} km`
                        : ""}
                      {match.sameImage ? " · same photo" : ""}
                      {` · 👍 ${match.upvotes}`}
                    </small>
                    <StatusBadge status={match.status} />
                  </div>

                  <button
                    type="button"
                    className="button button-dark"
                    disabled={submitting}
                    onClick={() => meToo(match)}
                  >
                    {t("report.meToo")}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="button-ghost"
              onClick={() => setDuplicatesDismissed(true)}
            >
              {t("report.keepMine")}
            </button>
          </div>
        )}

        {checkingDuplicates && (
          <p className="label-hint">{t("report.checkingDuplicates")}</p>
        )}

        <div className="location-actions">
          <button type="button" onClick={getLocation} disabled={locating}>
            {locating ? t("report.locating") : t("report.locate")}
          </button>
          {formData.latitude && (
            <span className="location-note">
              {t("report.gpsSaved")}
              {formData.accuracy ? ` · ±${formData.accuracy} m` : ""}
            </span>
          )}
        </div>

        <div className="location-fields">
          <input readOnly placeholder="Latitude" value={formData.latitude} aria-label="Latitude" />
          <input readOnly placeholder="Longitude" value={formData.longitude} aria-label="Longitude" />
        </div>

        {message && <p className="form-message" role="alert">{message}</p>}

        <button type="submit" disabled={submitting || preparingImage}>
          {submitting ? t("report.submitting") : t("report.submit")}
        </button>
      </form>
    </div>
  );
}
