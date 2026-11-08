import { useCallback, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";

const ZONES = ["North", "South", "East", "West", "Central"];
const emptyWard = {
  id: "",
  name: "",
  area: "",
  zone: "Central",
  latitude: "",
  longitude: "",
  representativeId: "",
};

export default function AdminWards() {
  const [form, setForm] = useState(emptyWard);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call("listWards"), []);
  const { data, loading, error: loadError, reload } = useService(load);

  const loadReps = useCallback(() => call("listRepresentatives"), []);
  const { data: repsData } = useService(loadReps);

  const wards = data?.items || [];
  const representatives = repsData?.items || [];

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const startEdit = (ward) => {
    setForm({
      id: ward.id,
      name: ward.name,
      area: ward.area,
      zone: ward.zone,
      latitude: String(ward.center?.[0] ?? ""),
      longitude: String(ward.center?.[1] ?? ""),
      representativeId: ward.representativeId || "",
    });
    setMessage("");
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();

    if (String(form.latitude).trim() === "" || String(form.longitude).trim() === "") {
      setError("Enter the ward latitude and longitude.");
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("saveWard", {
        id: form.id || undefined,
        name: form.name,
        area: form.area,
        zone: form.zone,
        center: [Number(form.latitude), Number(form.longitude)],
        representativeId: form.representativeId,
      });
      setMessage(result.message);
      setForm(emptyWard);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ward) => {
    if (!window.confirm(`Remove ${ward.name} · ${ward.area}? This cannot be undone.`)) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("deleteWard", { id: ward.id });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="admin-card">
        <h2>
          Ward management
          <small>{loading ? "Loading…" : `${wards.length} ward(s)`}</small>
        </h2>

        {(loadError || error) && <p className="form-message" role="alert">{loadError || error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        <form className="admin-form" onSubmit={save}>
          <label className="admin-field">Ward name
            <input
              required
              minLength="2"
              maxLength="40"
              placeholder="Ward 61"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>

          <label className="admin-field">Area
            <input
              required
              minLength="2"
              maxLength="60"
              placeholder="Bawadia Kalan"
              value={form.area}
              onChange={(event) => update("area", event.target.value)}
            />
          </label>

          <label className="admin-field">Zone
            <select value={form.zone} onChange={(event) => update("zone", event.target.value)}>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">Latitude
            <input
              required
              type="number"
              step="0.0001"
              min="-90"
              max="90"
              placeholder="23.2599"
              value={form.latitude}
              onChange={(event) => update("latitude", event.target.value)}
            />
          </label>

          <label className="admin-field">Longitude
            <input
              required
              type="number"
              step="0.0001"
              min="-180"
              max="180"
              placeholder="77.4126"
              value={form.longitude}
              onChange={(event) => update("longitude", event.target.value)}
            />
          </label>

          <label className="admin-field">Representative
            <select
              value={form.representativeId}
              onChange={(event) => update("representativeId", event.target.value)}
            >
              <option value="">Not assigned</option>
              {representatives.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>

          <button type="submit" className="small-button" disabled={busy}>
            {busy ? "Saving…" : form.id ? "Update ward" : "Add ward"}
          </button>

          {form.id && (
            <button type="button" className="small-button" onClick={() => setForm(emptyWard)}>
              Cancel
            </button>
          )}
        </form>
      </section>

      <section className="admin-card">
        <h2>All wards</h2>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ward</th>
                <th>Area</th>
                <th>Zone</th>
                <th>Coordinates</th>
                <th>Representative</th>
                <th>Complaints</th>
                <th>Resolved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((ward) => (
                <tr key={ward.id}>
                  <td>{ward.name}</td>
                  <td>{ward.area}</td>
                  <td>{ward.zone}</td>
                  <td>{ward.center?.join(", ")}</td>
                  <td>{ward.representative}</td>
                  <td>{ward.complaints}</td>
                  <td>{ward.resolved}</td>
                  <td>
                    <div className="admin-actions">
                      <button type="button" className="small-button" onClick={() => startEdit(ward)}>
                        Edit
                      </button>
                      <button type="button" className="small-button danger" onClick={() => remove(ward)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && wards.length === 0 && <p className="admin-empty">No wards yet.</p>}
      </section>
    </>
  );
}
