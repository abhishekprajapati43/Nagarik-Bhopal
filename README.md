# Nagarik Bhopal — Civic Connect

A civic complaint platform for Bhopal: residents report waste and civic issues,
track their status, support each other's reports, administrators manage wards,
representatives, complaints and broadcasts, and sanitation officers work through
the complaints assigned to them.

The React + Vite frontend is unchanged. It now runs against a PostgreSQL-backed
Express API with JWT authentication and role-based access control.

## Run it

```bash
npm install
npm run db:setup
npm start
```

Then open <http://localhost:5000>.

| Role | Email | Password |
| --- | --- | --- |
| Resident | citizen@nagarik.bhopal | Citizen@123 |
| Administrator | admin@nagarik.bhopal | Admin@123 |
| Sanitation Officer | officer@nagarik.bhopal | Officer@123 |

Configuration lives in `.env` (see `.env.example`). PostgreSQL must be running.

## Frontend

The built bundle in `assets/` talks to the API automatically:

- served by Express on port 5000 → same-origin requests;
- opened with Live Server on port 5500/5501 → requests go to `http://localhost:5000`.

Rebuild after changing frontend code with `npm run build`. To restore the old
offline localStorage demo, build with `VITE_DATA_MODE=device`.

See [backend/README.md](backend/README.md) for the API reference, environment
variables and database schema, [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md) for
the workflow, officer module, verification, analytics, i18n, reports and email
features (with test steps),
[AADHAAR_VERIFICATION.md](AADHAAR_VERIFICATION.md) for Aadhaar registration,
masking, admin approval, audit history and role rules, and
[WARD_MASTER_DATA.md](WARD_MASTER_DATA.md) for the BMC ward master schema,
import command, API changes, routing rules and data provenance.
