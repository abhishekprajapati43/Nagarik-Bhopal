import { useCallback, useMemo, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";

const emptyWard = {
  id: "",
  wardNumber: "",
  name: "",
  area: "",
  zoneNumber: "",
  assemblyConstituency: "",
  councillorName: "",
  councillorMobile: "",
  population: "",
  latitude: "",
  longitude: "",
  assignedOfficerId: "",
  representativeId: "",
  officeAddress: "",
  email: "",
  mlaName: "",
};

const labelOf = (ward) =>
  ward.wardNumber ? `Ward ${ward.wardNumber} · ${ward.name}` : ward.name;

export default function AdminWards() {
  const [form, setForm] = useState(emptyWard);
  const [filters, setFilters] = useState({
    search: "",
    zoneNumber: "",
    assignedOfficerId: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call("listWards"), []);
  const { data, loading, error: loadError, reload } = useService(load);

  const loadReps = useCallback(() => call("listRepresentatives"), []);
  const { data: repsData } = useService(loadReps);

  const loadOfficers = useCallback(() => call("listOfficers"), []);
  const { data: officersData } = useService(loadOfficers);

  const wards = data?.items || [];
  const representatives = repsData?.items || [];
  const officers = officersData?.items || [];

  const zones = useMemo(
    () =>
      [...new Set(wards.map((ward) => ward.zoneNumber).filter((zone) => zone !== null))]
        .sort((left, right) => left - right),
    [wards]
  );

  const visibleWards = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return wards.filter((ward) => {
      if (filters.zoneNumber && Number(ward.zoneNumber) !== Number(filters.zoneNumber)) {
        return false;
      }

      if (filters.assignedOfficerId === "__unassigned__") {
        if (ward.assignedOfficerId) return false;
      } else if (
        filters.assignedOfficerId &&
        ward.assignedOfficerId !== filters.assignedOfficerId
      ) {
        return false;
      }

      if (!search) return true;

      return [
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
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [wards, filters]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const updateFilter = (field, value) =>
    setFilters((current) => ({ ...current, [field]: value }));

  const resetForm = () => setForm(emptyWard);

  const startEdit = (ward) => {
    setForm({
      id: ward.id,
      wardNumber: ward.wardNumber ?? "",
      name: ward.name || "",
      area: ward.area || "",
      zoneNumber: ward.zoneNumber ?? "",
      assemblyConstituency: ward.assemblyConstituency || "",
      councillorName: ward.councillorName || "",
      councillorMobile: ward.councillorMobile || "",
      population: ward.population ?? "",
      latitude: String(ward.center?.[0] ?? ""),
      longitude: String(ward.center?.[1] ?? ""),
      assignedOfficerId: ward.assignedOfficerId || "",
      representativeId: ward.representativeId || "",
      officeAddress: ward.officeAddress || "",
      email: ward.representativeEmail || "",
      mlaName: ward.mlaName || "",
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        wardName: form.name,
        name: form.name,
        area: form.area,
        wardNumber: form.wardNumber,
        zoneNumber: form.zoneNumber,
        assemblyConstituency: form.assemblyConstituency,
        councillorName: form.councillorName,
        councillorMobile: form.councillorMobile,
        population: form.population,
        center: [Number(form.latitude), Number(form.longitude)],
        assignedOfficerId: form.assignedOfficerId,
        representativeId: form.representativeId,
        officeAddress: form.officeAddress,
        email: form.email,
        mlaName: form.mlaName,
      });
      setMessage(result.message);
      resetForm();
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const quickAssign = async (ward, officerId) => {
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("assignWard", { id: ward.id, officerId });
      setMessage(result.message);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ward) => {
    if (!window.confirm(`Remove ${labelOf(ward)}? This cannot be undone.`)) return;

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
          <label className="admin-field">Ward number
            <input
              type="number"
              min="1"
              max="200"
              placeholder="61"
              value={form.wardNumber}
              onChange={(event) => update("wardNumber", event.target.value)}
            />
          </label>

          <label className="admin-field">Ward name
            <input
              required
              minLength="2"
              maxLength="80"
              placeholder="Bawadia Kalan"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>

          <label className="admin-field">Area / main locality
            <input
              required
              minLength="2"
              maxLength="60"
              placeholder="Bawadia Kalan"
              value={form.area}
              onChange={(event) => update("area", event.target.value)}
            />
          </label>

          <label className="admin-field">Zone number
            <input
              type="number"
              min="1"
              max="30"
              placeholder="13"
              value={form.zoneNumber}
              onChange={(event) => update("zoneNumber", event.target.value)}
            />
          </label>

          <label className="admin-field">Assembly constituency
            <input
              maxLength="80"
              placeholder="Huzur"
              value={form.assemblyConstituency}
              onChange={(event) => update("assemblyConstituency", event.target.value)}
            />
          </label>

          <label className="admin-field">Councillor name
            <input
              maxLength="80"
              placeholder="Mr. Laxman Rajput"
              value={form.councillorName}
              onChange={(event) => update("councillorName", event.target.value)}
            />
          </label>

          <label className="admin-field">Councillor mobile
            <input
              type="tel"
              maxLength="10"
              placeholder="9876543210"
              value={form.councillorMobile}
              onChange={(event) => update("councillorMobile", event.target.value)}
            />
          </label>

          <label className="admin-field">Population
            <input
              type="number"
              min="0"
              max="10000000"
              placeholder="45000"
              value={form.population}
              onChange={(event) => update("population", event.target.value)}
            />
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

          <label className="admin-field">Sanitation officer
            <select
              value={form.assignedOfficerId}
              onChange={(event) => update("assignedOfficerId", event.target.value)}
            >
              <option value="">No officer (admin pending queue)</option>
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                  {officer.employeeCode ? ` · ${officer.employeeCode}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">Representative
            <select
              value={form.representativeId}
              onChange={(event) => update("representativeId", event.target.value)}
            >
              <option value="">Not assigned</option>
              {representatives.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}{person.ward ? ` · ${person.ward}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">Office address
            <input
              maxLength="200"
              placeholder="Ward office address"
              value={form.officeAddress}
              onChange={(event) => update("officeAddress", event.target.value)}
            />
          </label>

          <label className="admin-field">Representative email
            <input
              type="email"
              maxLength="120"
              placeholder="ward@nagarik.bhopal"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </label>

          <label className="admin-field">MLA name
            <input
              maxLength="80"
              placeholder="MLA name"
              value={form.mlaName}
              onChange={(event) => update("mlaName", event.target.value)}
            />
          </label>

          <button type="submit" className="small-button" disabled={busy}>
            {busy ? "Saving…" : form.id ? "Update ward" : "Add ward"}
          </button>

          {form.id && (
            <button type="button" className="small-button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </form>
      </section>

      <section className="admin-card">
        <h2>
          All wards
          <small>{loading ? "Loading…" : `${visibleWards.length} shown`}</small>
        </h2>

        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search ward number, name, area, zone, constituency or councillor…"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            aria-label="Search wards"
          />

          <select
            value={filters.zoneNumber}
            onChange={(event) => updateFilter("zoneNumber", event.target.value)}
            aria-label="Zone"
          >
            <option value="">All zones</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>Zone {zone}</option>
            ))}
          </select>

          <select
            value={filters.assignedOfficerId}
            onChange={(event) => updateFilter("assignedOfficerId", event.target.value)}
            aria-label="Assigned officer"
          >
            <option value="">All officers</option>
            <option value="__unassigned__">Pending queue (no officer)</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}{officer.employeeCode ? ` · ${officer.employeeCode}` : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="small-button"
            onClick={() => setFilters({ search: "", zoneNumber: "", assignedOfficerId: "" })}
          >
            Reset filters
          </button>
        </div>

        {visibleWards.length === 0 ? (
          <p className="admin-empty">No wards match these filters.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Area</th>
                  <th>Zone</th>
                  <th>Constituency</th>
                  <th>Councillor</th>
                  <th>Officer</th>
                  <th>Complaints</th>
                  <th>Resolved</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleWards.map((ward) => (
                  <tr key={ward.id}>
                    <td>
                      <b>{labelOf(ward)}</b>
                      {ward.isDefault && (
                        <span className="load-bar" title="Official BMC ward — protected from deletion">
                          <small>Protected</small>
                        </span>
                      )}
                    </td>
                    <td>{ward.area || "—"}</td>
                    <td>{ward.zone || (ward.zoneNumber ? `Zone ${ward.zoneNumber}` : "—")}</td>
                    <td>{ward.assemblyConstituency || "—"}</td>
                    <td>
                      {ward.councillorName || "—"}
                      {ward.councillorMobile ? <><br /><small>{ward.councillorMobile}</small></> : null}
                    </td>
                    <td>
                      <select
                        value={ward.assignedOfficerId || ""}
                        onChange={(event) => quickAssign(ward, event.target.value)}
                        disabled={busy}
                        aria-label={`Sanitation officer for ${labelOf(ward)}`}
                      >
                        <option value="">Pending queue</option>
                        {officers.map((officer) => (
                          <option key={officer.id} value={officer.id}>
                            {officer.name}{officer.employeeCode ? ` · ${officer.employeeCode}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{ward.complaints}</td>
                    <td>{ward.resolved}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="small-button" onClick={() => startEdit(ward)}>
                          Edit / assign
                        </button>
                        {ward.isDefault ? (
                          <span className="admin-note">Protected</span>
                        ) : (
                          <button
                            type="button"
                            className="small-button danger"
                            onClick={() => remove(ward)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
