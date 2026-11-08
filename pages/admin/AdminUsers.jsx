import { useCallback, useState } from "react";
import { useService } from "../../hooks/useService";
import { messageFor } from "../../shared/errors";
import { call } from "../../utils/api";
import { formatDate } from "../../utils/format";

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => call("listUsers", { search }), [search]);
  const { data, loading, error: loadError, reload } = useService(load);

  const toggleStatus = async (user) => {
    setBusyId(user.id);
    setMessage("");
    setError("");

    try {
      const result = await call("setUserStatus", {
        userId: user.id,
        status: user.status === "active" ? "blocked" : "active",
      });
      setMessage(`${user.name}: ${result.message}`);
      await reload();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusyId("");
    }
  };

  const users = data?.items || [];

  return (
    <>
      <section className="admin-card">
        <h2>
          User management
          <small>{loading ? "Loading…" : `${users.length} resident(s)`}</small>
        </h2>

        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search by name, email, phone or ward"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search users"
          />
        </div>

        {(loadError || error) && <p className="form-message" role="alert">{loadError || error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        {!loading && users.length === 0 ? (
          <p className="admin-empty">No residents match that search.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Ward</th>
                  <th>Reports</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.phone || "—"}</td>
                    <td>{user.ward || "Not set"}</td>
                    <td>{user.complaints}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <span className={user.status === "active" ? "pill pill-ok" : "pill pill-bad"}>
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={user.status === "active" ? "small-button danger" : "small-button"}
                        disabled={busyId === user.id}
                        onClick={() => toggleStatus(user)}
                      >
                        {busyId === user.id
                          ? "Saving…"
                          : user.status === "active"
                            ? "Block"
                            : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="admin-note">
        Blocking an account keeps its reports and history intact but signs the resident out and
        prevents new reports. Administrator accounts cannot be blocked here.
      </p>
    </>
  );
}
