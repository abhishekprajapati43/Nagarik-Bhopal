# Nagarik Bhopal — Backend

Express 4 + PostgreSQL 18 REST API with JWT authentication, role-based access
control, validation, rate limiting, structured logging, audit trails and image
uploads. It also keeps the original single-endpoint RPC API working so the
existing React frontend needs no changes to its data layer.

## Quick start

```bash
npm install
npm run db:setup     # creates every table and the first-run dataset
npm start            # http://localhost:5000
```

`npm start` also runs pending migrations and seeds an empty database, so
`db:setup` is only needed if you want to prepare the schema without starting
the server.

Open <http://localhost:5000> for the bundled frontend, or
<http://localhost:5000/api/health> to check readiness.

### Demo accounts

| Role     | Email                    | Password     |
| -------- | ------------------------ | ------------ |
| Resident | citizen@nagarik.bhopal   | Citizen@123  |
| Admin    | admin@nagarik.bhopal     | Admin@123    |
| Officer  | officer@nagarik.bhopal   | Officer@123  |

Extra seeded residents (`rahul@nagarik.bhopal`, `ankit@nagarik.bhopal`) also use
`Citizen@123`. The seeded sanitation officer is `SO-1042` in the South zone and
signs in at `/officer/login`.

### Complaint workflow

```
Reported (Pending) → Assigned → In-Progress → Resolved → Citizen Verification → Closed
                                                          └── No → Reopened
```

Every transition is written to both `complaint_timeline` (the public progress
timeline) and `status_history` (the internal audit trail with the actor and
role). Legacy `Pending`, `In-Progress`, `Resolved` and `Rejected` rows remain
valid.

## Environment

Copy `.env.example` to `.env`. The server reads:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Enables strict secret checks in production |
| `PORT` | `5000` | HTTP port |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | PostgreSQL location |
| `DB_NAME` | `clean_bhopal_db` | Database name |
| `DB_USER` / `DB_PASSWORD` | `postgres` / empty | Database credentials |
| `DB_SSL` | `false` | Enable TLS to PostgreSQL |
| `DB_POOL_MAX` | `10` | Connection pool size |
| `JWT_SECRET` | demo fallback in dev | HS256 signing secret, 32+ chars required in production |
| `AADHAAR_ENCRYPTION_KEY` | derived from `JWT_SECRET` in dev | AES-256-GCM key material for stored Aadhaar numbers (set in production) |
| `AADHAAR_LOOKUP_KEY` | derived from the encryption key | HMAC key for duplicate-Aadhaar lookup hashes (set in production) |
| `CORS_ORIGIN` | localhost dev ports | Comma-separated browser origins, or `*` |
| `BODY_LIMIT` | `4mb` | JSON body limit (complaint photos arrive as data URLs) |
| `UPLOAD_DIR` | `backend/storage/uploads` | Local image storage |
| `MAX_UPLOAD_BYTES` | `2000000` | Per-image upload limit |
| `RESET_TOKEN_TTL_MINUTES` | `30` | Password-reset token lifetime |
| `EXPOSE_RESET_TOKEN` | `true` outside production | Returns the reset token in the API response for development |
| `RATE_LIMIT_ENABLED` | `true` | Master switch for the limiter |
| `LOG_LEVEL` | `debug` / `info` | `error`, `warn`, `info`, `debug` |
| `TRUST_PROXY` | `false` | Set when running behind a reverse proxy |

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the API (migrate + seed first) |
| `npm run server` | Start with file watching |
| `npm run db:setup` | Apply migrations and seed an empty database |
| `npm run db:import-wards` | Upsert the BMC ward master from `backend/db/data/bhopal-wards.json` |
| `npm run build` | Rebuild the frontend bundle |

## Response format

Successful REST responses:

```json
{ "success": true, "data": { ... } }
```

Errors:

```json
{
  "success": false,
  "error": { "code": "VALIDATION", "message": "Password is required." },
  "requestId": "7d40b8a1-a025-4b0d-b481-8f758800aaa0"
}
```

List endpoints return `data.items` plus `total`, `page`, `pages` and `limit`.
Complaint lists also include `statusCounts`. Every response carries an
`X-Request-Id` header, and every request is logged as one JSON line.

Authentication uses `Authorization: Bearer <token>`. The RPC bridge additionally
accepts the token in the request body, matching the bundled frontend.

## REST endpoints

### Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | `name`, `phone` (required, 10 digits), `aadhaarNumber` (required, 12 digits), `password`; `email` and `wardId` optional |
| POST | `/api/auth/login` | Public | `identifier` (email or 10-digit phone), `password`; residents only |
| POST | `/api/auth/admin/login` | Public | Same body; rejects non-admin accounts |
| POST | `/api/auth/officer/login` | Public | Same body; rejects non-officer accounts |
| GET | `/api/auth/me` | JWT | Returns the current account with masked Aadhaar status only |
| PATCH | `/api/auth/me` | JWT | Update `name`, `phone`, `wardId` |
| POST | `/api/auth/aadhaar` | Resident JWT | `aadhaarNumber`; submits or retries Aadhaar verification |
| POST | `/api/auth/change-password` | JWT | `currentPassword`, `newPassword` |
| POST | `/api/auth/forgot-password` | Public | `identifier`; generic response, dev token when exposed |
| POST | `/api/auth/reset-password` | Public | `token`, `password`; revokes existing sessions |

### Complaints

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/complaints` | JWT | `scope=mine`, `page`, `limit`, `status`, `assignedOfficerId`, `unassignedOfficer=true`, `verificationStatus`, `complaintCategory`, `complaintType`, `wasteType` (legacy), `wardId`, `priority`, `search`, `from`, `to`, `sort=newest\|oldest\|upvotes\|priority`. Officers always receive only their own assigned work. |
| POST | `/api/complaints` | JWT | `complaintCategory`, `complaintType` (or legacy `wasteType`), `description`, `address`, `priority?`, `wardId?`, `image?`, `position?` |
| GET | `/api/complaints/:id` | JWT | Full detail with comments, timeline, status history and assignments |
| POST | `/api/complaints/:id/upvote` | JWT | Toggles "me too" |
| POST | `/api/complaints/:id/comments` | JWT | `text` |
| POST | `/api/complaints/:id/verification` | Reporter or admin | `resolved` (`true`/`false`), `note?`; Yes → `Closed`, No → `Reopened` |
| PATCH | `/api/complaints/:id/status` | Admin | `status`, `note?`; `Resolved`/`Citizen Verification` starts the citizen check |
| PATCH | `/api/complaints/:id/assignment` | Admin | `wardId?`, `representativeId?`, `officerId?`, `note?`; reassigning closes the previous assignment |

### Sanitation officers

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/officers` | Admin | Active officer directory for assignment |
| GET | `/api/officer/dashboard` | Officer | Total, pending, in progress, resolved, assigned today, recent work |
| GET | `/api/officer/profile` | Officer | The signed-in officer's profile |
| GET | `/api/officer/complaints` | Officer | Only complaints assigned to the signed-in officer |
| GET | `/api/officer/complaints/:id` | Officer | Assigned complaint detail with timeline and status history |
| PATCH | `/api/officer/complaints/:id/status` | Officer | `status`: `In-Progress` or `Resolved`, plus `note?`, `beforePhoto?`, `afterPhoto?`, `workNotes?` |
| PATCH | `/api/officer/complaints/:id/work` | Officer | Save `beforePhoto`, `afterPhoto`, `workNotes`, `note?` without changing status |
| POST | `/api/officer/complaints/:id/resolve` | Officer | Convenience route equivalent to `status: "Resolved"` |

Officers cannot delete complaints, edit the complaint category or citizen
details, verify their own work, or call any admin endpoint. Resolution is only
allowed for an assigned complaint and immediately asks the citizen
“Has your issue been resolved?”.

### Reference data

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/wards` | Public (needed by registration) |
| GET | `/api/wards/heatmap` | Public; ward-level total/pending/resolved counts for the map |
| POST / PUT / DELETE | `/api/wards` / `/api/wards/:id` | Admin |
| GET | `/api/representatives` | Public |
| POST / PUT / DELETE | `/api/representatives` / `/:id` | Admin |

`GET /api/wards` accepts `search`, `wardNumber`, `zoneNumber`,
`assemblyConstituency`, `assignedOfficerId` and `unassignedOfficer=true`.
Search covers ward number, name, area, zone, assembly constituency, councillor
name and councillor mobile. The admin RPC bridge adds `getWard`,
`assignWard` and `wardHeatmap`; `listWards` forwards the same filters.

### Dashboard, notifications, settings, search

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/dashboard/me` | JWT | Resident totals, upvotes received, recent complaints |
| GET | `/api/dashboard/admin` | Admin | Totals, by status/category/waste/ward, 7-day trend, top complaints |
| GET | `/api/notifications` | JWT | Paginated inbox with unread count |
| PATCH | `/api/notifications/read` | JWT | Mark all read |
| PATCH | `/api/notifications/:id/read` | JWT | Mark one read |
| POST | `/api/notifications/broadcast` | Admin | `title`, `body`, `wardId?` |
| GET | `/api/settings` | Public | Support settings used by the public pages |
| PUT / PATCH | `/api/settings` | Admin | Full settings payload |
| GET | `/api/search?q=` | JWT | Complaints, wards, representatives; users for admins |
| GET | `/api/users?search&status&page&limit` | Admin | Residents only |
| PATCH | `/api/users/:id/status` | Admin | `status`: `active` or `blocked` |

### Uploads and health

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/uploads` | JWT | `multipart/form-data`, field `file`; JPEG/PNG/WebP/GIF, max 2 MB |
| DELETE | `/api/uploads/:id` | Owner or admin | Removes the row and the stored file |
| GET | `/uploads/:filename` | Public | Stored image bytes |
| GET | `/api/health` | Public | 200 with database status, 503 when the database is down |

An uploaded image URL (`/uploads/...`) can be sent as the `image` field when
creating a complaint, alongside the existing data-URL support.

The built bundle in `assets/` is served with `Cache-Control: public, max-age=0`
and an ETag. A rebuilt bundle is therefore picked up on the next page load while
unchanged files still return `304 Not Modified`.

### Legacy RPC bridge

`POST /api/rpc` accepts `{ "method": "...", "args": { ... }, "token": "..." }`
and returns `{ "ok": true, "result": ... }` or
`{ "ok": false, "error": { "code": "...", "message": "..." } }`. It exposes the
same methods the frontend already calls (`login`, `listComplaints`,
`createComplaint`, `analytics`, `listWards`, ...) and delegates to the same
services as the REST routes, including their role checks.

Officer methods: `officerLogin`, `officerDashboard`, `officerProfile`,
`listOfficerComplaints`, `getOfficerComplaint`, `updateOfficerStatus`,
`resolveOfficerComplaint`, `updateOfficerWork`. Admin methods used by the
assignment screen: `listOfficers`, `assignComplaint`. The citizen verification
step is `verifyComplaint`.

Aadhaar methods: `submitAadhaar` (signed-in resident) and
`listCitizenVerifications`, `reviewCitizenVerification`,
`listVerificationAudit` (administrator only). See
[AADHAAR_VERIFICATION.md](../AADHAAR_VERIFICATION.md).

## Testing the officer workflow

1. Run `npm start` (or `npm run db:setup && npm start`) so `003_officer_workflow`
   is applied and the demo officer exists.
2. Sign in as the administrator at `/admin/login`; open **Complaints**, choose a
   pending report, pick **Kavita Yadav** under *Sanitation officer* and save.
   The complaint moves to `Assigned` and the officer is notified.
3. Sign in at `/officer/login` with `officer@nagarik.bhopal` / `Officer@123`.
   The dashboard shows the assigned totals. Open **Assigned Complaints**, select
   the report, add work notes or before/after photos and press **Start work**.
4. Upload an after photo, note what was cleaned and press **Mark as resolved**.
   The complaint enters `Citizen Verification` and the citizen receives the
   “Has your issue been resolved?” notification.
5. Sign in as the resident at `/login`, open the complaint and answer **Yes** or
   **No**. Yes moves it to `Closed`; No moves it to `Reopened` and notifies the
   administrator and officer. The timeline and status history record every step
   with date and time.
6. Role checks: a resident or admin opening `/officer/dashboard` is redirected,
   and the officer cannot open any `/admin` route or call an admin RPC method.

## Database schema

Migrations live in `db/schema.sql` (plus `db/002_complaint_categories.sql`,
`db/003_officer_workflow.sql`, `db/004_advanced_features.sql` and
`db/005_aadhaar_verification.sql`) and are applied by `db/migrate.js` under a
PostgreSQL advisory lock. Tables:

| Table | Purpose | Key relationships |
| --- | --- | --- |
| `wards` | Ward master data and map centre | `representative_id → representatives.id` |
| `representatives` | Corporators and ward officers | `ward_id → wards.id` |
| `users` | Residents, officers and admins with PBKDF2 password hashes and encrypted Aadhaar identity fields | `ward_id → wards.id` |
| `officers` | Sanitation officer profile and work zone | `user_id → users.id` (unique) |
| `complaints` | Reports with category, issue type, status, priority, image, coordinates, assigned officer, before/after photos, work notes and verification state | `user_id → users.id`, `ward_id → wards.id`, `representative_id → representatives.id`, `assigned_officer_id → officers.id` |
| `complaint_upvotes` | One "me too" per user per complaint | Composite PK, cascades with complaint/user |
| `complaint_comments` | Discussion on a complaint | `complaint_id`, `user_id` |
| `complaint_timeline` | Public progress timeline | `complaint_id` |
| `complaint_assignments` | Officer assignment history (one active row per complaint) | `complaint_id`, `officer_id`, `assigned_by → users.id` |
| `status_history` | Every status transition with actor and role | `complaint_id`, `actor_id → users.id` |
| `notifications` | Per-user inbox | `user_id`, optional `complaint_id` |
| `app_settings` | Single JSONB settings row | — |
| `password_reset_tokens` | Hashed, single-use reset tokens | `user_id` |
| `uploads` | Image metadata | `user_id` |
| `audit_logs` | Auth and admin action trail | `actor_id` |

Foreign keys, CHECK constraints, uniqueness (email, phone digits, ward name)
and indexes on the common filters are defined in SQL. `updated_at` is maintained
by a trigger.

## Security notes

- Passwords are hashed with PBKDF2-SHA256 (120k iterations, per-user salt).
- JWTs are HS256, pinned on verification, with role-specific lifetimes and a
  `tv` claim checked against `users.token_version`. Password resets revoke all
  existing sessions; a normal password change keeps the current one.
- Every authenticated request re-loads the account, so blocking a user takes
  effect immediately.
- Queries are parameterized; uploads check both MIME type and file signature.
- Aadhaar numbers are encrypted with AES-256-GCM before storage, duplicate
  checks use a keyed HMAC hash, and every API response carries only
  `XXXX XXXX 1234`. The lookup hash and ciphertext are never serialized.
- Resident complaint creation requires `verificationStatus = Verified`;
  administrators review requests and every decision is written to `audit_logs`.
- Auth, upload and global rate limits are enabled by default.
- Audit rows record registrations, logins, password changes/resets, admin
  changes, broadcasts and uploads.
