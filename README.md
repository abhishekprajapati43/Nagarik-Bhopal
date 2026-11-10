# Nagarik Bhopal — Civic Connect

A civic complaint platform for Bhopal: residents report waste and civic issues,
track their status, support each other's reports, and administrators manage
wards, representatives, complaints and broadcasts.

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

Configuration lives in `.env` (see `.env.example`). PostgreSQL must be running.

## Frontend

The built bundle in `assets/` talks to the API automatically:

- served by Express on port 5000 → same-origin requests;
- opened with Live Server on port 5500/5501 → requests go to `http://localhost:5000`.

Rebuild after changing frontend code with `npm run build`. To restore the old
offline localStorage demo, build with `VITE_DATA_MODE=device`.

See [backend/README.md](backend/README.md) for the API reference, environment
variables and database schema.
