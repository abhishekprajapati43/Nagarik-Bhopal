import { useCallback, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";

const emptyPerson = { id: "", name: "", designation: "", phone: "", email: "", wardId: "" };

export default function AdminRepresentatives() {
  const [form, setForm] = useState(emptyPerson);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call("listRepresentatives"), []);
  const { data, loading, error: loadError, reload } = useService(load);

  const loadWards = useCallback(() => call("listWards"), []);
  const { data: wardsData } = useService(loadWards);

  const representatives = data?.items || [];
  const wards = wardsData?.items || [];

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const startEdit = (person) => {
    setForm({
      id: person.id,
      name: person.name,
      designation: person.designation || "",
      phone: person.phone || "",
      email: person.email || "",
      wardId: person.wardId || "",
    });
    setMessage("");
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("saveRepresentative", {
        id: form.id || undefined,
        name: form.name,
        designation: form.designation,
        phone: form.phone,
        email: form.email,
        wardId: form.wardId,
      });
      setMessage(result.message);
      setForm(emptyPerson);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (person) => {
    if (!window.confirm(`Remove ${person.name}? Existing complaints stay but lose this contact.`)) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await call("deleteRepresentative", { id: person.id });
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
          Representative management
          <small>{loading ? "Loading…" : `${representatives.length} contact(s)`}</small>
        </h2>

        {(loadError || error) && <p className="form-message" role="alert">{loadError || error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        <form className="admin-form" onSubmit={save}>
          <label className="admin-field">Name
            <input
              required
              minLength="2"
              maxLength="60"
              placeholder="Mr. Rajesh Sharma"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>

          <label className="admin-field">Designation
            <input
              maxLength="60"
              placeholder="Ward Corporator"
              value={form.designation}
              onChange={(event) => update("designation", event.target.value)}
            />
          </label>

          <label className="admin-field">Phone
            <input
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </label>

          <label className="admin-field">Email
            <input
              type="email"
              placeholder="name@nagarik.bhopal"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </label>

          <label className="admin-field">Ward
            <select value={form.wardId} onChange={(event) => update("wardId", event.target.value)}>
              <option value="">Not assigned</option>
              {wards.map((ward) => (
                <option key={ward.id} value={ward.id}>{ward.name} · {ward.area}</option>
              ))}
            </select>
          </label>

          <button type="submit" className="small-button" disabled={busy}>
            {busy ? "Saving…" : form.id ? "Update contact" : "Add contact"}
          </button>

          {form.id && (
            <button type="button" className="small-button" onClick={() => setForm(emptyPerson)}>
              Cancel
            </button>
          )}
        </form>
      </section>

      <section className="admin-card">
        <h2>All representatives</h2>

        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Ward</th>
                <th>Assigned complaints</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {representatives.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.designation}</td>
                  <td>{person.phone || "—"}</td>
                  <td>{person.email || "—"}</td>
                  <td>{person.ward || "Not assigned"}</td>
                  <td>{person.complaints}</td>
                  <td>
                    <div className="admin-actions">
                      <button type="button" className="small-button" onClick={() => startEdit(person)}>
                        Edit
                      </button>
                      <button type="button" className="small-button danger" onClick={() => remove(person)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && representatives.length === 0 && (
          <p className="admin-empty">No representatives yet. Add the first ward contact above.</p>
        )}
      </section>
    </>
  );
}
