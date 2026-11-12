# Nagarik Bhopal — Advanced Civic Features

This document covers the advanced complaint workflow added on top of the
existing Nagarik Bhopal app. The original pages, authentication, complaint
system, dashboards and visual design are preserved; every change is additive.

Aadhaar citizen verification is documented separately in
[AADHAAR_VERIFICATION.md](AADHAAR_VERIFICATION.md). Login is unchanged; only
registration/profile completion collects Aadhaar, and unverified residents
cannot submit complaints.

Demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Resident | `citizen@nagarik.bhopal` | `Citizen@123` |
| Administrator | `admin@nagarik.bhopal` | `Admin@123` |
| Sanitation Officer | `officer@nagarik.bhopal` | `Officer@123` |

Run with:

```bash
npm run db:setup   # applies migrations 001–005 and seeds demo data
npm start          # API + built SPA on http://localhost:5000
npm run build      # rebuild assets/app.js + assets/app.css after UI changes
```

---

## 1. Files created and modified

### Created — backend

| File | Purpose |
| --- | --- |
| `backend/db/002_complaint_categories.sql` | Complaint category / issue-type columns and indexes. |
| `backend/db/003_officer_workflow.sql` | Officer role, `officers`, assignments, status history, before/after photos, verification columns. |
| `backend/db/004_advanced_features.sql` | `Accepted` status, ward routing, representative MLA/office, AI/duplicate metadata, verification history, email outbox. |
| `backend/controllers/officer.controller.js` | Officer REST endpoints. |
| `backend/routes/officer.routes.js` | `/api/officer/*` routes. |
| `backend/routes/officerDirectory.routes.js` | `/api/officers` admin directory. |
| `backend/repositories/officer.repository.js` | Officer queries, workload stats, performance. |
| `backend/repositories/email.repository.js` | Email outbox queue and status updates. |
| `backend/services/officer.service.js` | Officer login gate, dashboard, assignment rules, work updates. |
| `backend/services/ai.service.js` | Optional server-side waste prediction (`WASTE_AI_URL`), never blocks submission. |
| `backend/services/email.service.js` | Template rendering, SMTP delivery, outbox fallback. |

### Created — frontend

| File | Purpose |
| --- | --- |
| `components/ComplaintCategoryFields.jsx` | Category + issue selects shared by citizen and admin screens. |
| `components/ComplaintQr.jsx` | Client-side QR code for a complaint URL. |
| `components/ShareMenu.jsx` | WhatsApp / Facebook / X / copy-link sharing. |
| `components/LanguageSwitcher.jsx` | English/हिन्दी selector used in all headers. |
| `components/TrendChart.jsx` | Dependency-free SVG trend line chart. |
| `context/LanguageContext.jsx` | Translation provider and `t()` helper. |
| `i18n/translations.js` | Flat-key English and Hindi dictionaries (extensible). |
| `pages/OfficerLogin.jsx` | Separate officer sign-in page. |
| `pages/officer/OfficerLayout.jsx` | Officer console shell. |
| `pages/officer/OfficerDashboard.jsx` | Officer workload dashboard. |
| `pages/officer/OfficerComplaints.jsx` | Assigned complaints, status, photos, work notes. |
| `pages/officer/officer.css` | Officer console styles. |
| `shared/ai.js` | Browser waste heuristic and image fingerprint. |
| `utils/complaint.js` | Category/issue display helpers for legacy complaints. |
| `utils/live.js` | Live-update event bus + cross-tab storage bridge. |
| `utils/reports.js` | CSV/PDF report builders (jsPDF, no table plugin). |

### Modified — backend

`backend/db/migrate.js`, `backend/db/schema.sql`, `backend/db/seed.js`,
`backend/config/env.js`, `backend/services/rpc.service.js`,
`backend/services/complaint.service.js`, `backend/services/auth.service.js`,
`backend/services/ward.service.js`, `backend/services/representative.service.js`,
`backend/services/settings.service.js`,
`backend/repositories/complaint.repository.js`,
`backend/repositories/ward.repository.js`,
`backend/repositories/representative.repository.js`,
`backend/controllers/auth.controller.js`, `backend/controllers/complaint.controller.js`,
`backend/routes/index.js`, `backend/routes/auth.routes.js`,
`backend/routes/complaint.routes.js`, `backend/middleware/auth.js`,
`backend/utils/authz.js`, `backend/utils/serialize.js`,
`backend/validation/query.js`.

### Modified — frontend / shared

`App.jsx`, `main.jsx`, `index.css`, `components/Navbar.jsx`,
`components/ComplaintCard.jsx`, `components/ComplaintCard.css`,
`components/StatusBadge.jsx`, `components/ReportComplaint.jsx`,
`context/AuthContext.jsx`, `hooks/useService.js`, `pages/ComplaintDetails.jsx`,
`pages/ComplaintDetails.css`, `pages/Complaints.jsx`, `pages/Map.jsx`,
`pages/Notifications.jsx`, `pages/Landing.jsx`, `pages/Login.jsx`,
`pages/user/UserLayout.jsx`, `pages/user/UserDashboard.jsx`,
`pages/user/UserComplaintStatus.jsx`, `pages/admin/AdminLayout.jsx`,
`pages/admin/AdminDashboard.jsx`, `pages/admin/AdminComplaints.jsx`,
`pages/admin/AdminAnalytics.jsx`, `pages/admin/AdminReports.jsx`,
`pages/admin/AdminSettings.jsx`, `pages/admin/admin.css`,
`shared/constants.js`, `shared/service.js`, `shared/rpc.js`,
`shared/seed.js`, `shared/validation.js`, `utils/api.js`,
`package.json`, `package-lock.json` (added `jspdf` and `qrcode`).

Rebuilt assets: `assets/app.js`, `assets/app.css` (plus jsPDF/QR helper chunks
in `assets/`).

---

## 2. Database changes

All migrations are additive; no existing row is rewritten destructively.

### Migration 002 — complaint categories

- `complaints.complaint_category text NOT NULL DEFAULT 'garbage-collection'`
- `complaints.complaint_type text NOT NULL` (legacy `waste_type` kept and mirrored)
- indexes `complaints_category_idx`, `complaints_type_idx`

### Migration 003 — officer workflow

- `users.role` check now allows `user`, `admin`, `officer`.
- New table `officers` (`user_id`, `employee_code`, `designation`, `zone`, `phone`, `is_active`).
- New table `complaint_assignments` (`complaint_id`, `officer_id`, `assigned_by`, `note`, `assigned_at`, `unassigned_at`, `active`).
- New table `status_history` (`from_status`, `to_status`, `note`, actor fields, `created_at`).
- `complaints`: `assigned_officer_id`, `before_photo`, `after_photo`, `work_notes`,
  `verification_status`, `verified_at`, `resolved_at`, `closed_at`, `reopened_at`.
- Status check includes `Assigned`, `In-Progress`, `Citizen Verification`, `Closed`, `Reopened`.
- Indexes on officer and verification status; history backfilled from the timeline.

### Migration 004 — advanced features

- Status check now also allows `Accepted`.
- `wards.assigned_officer_id` (+ index) for automatic ward routing.
- `representatives.mla_name`, `representatives.office_address`.
- `complaints`: `ai_waste_type`, `ai_confidence`, `image_fingerprint`,
  `duplicate_of_id`, `duplicate_score` (+ duplicate index).
- New table `verification_history` (`complaint_id`, `decision`, `note`, actor fields, `created_at`).
  Decisions: `requested`, `verified`, `reopened`.
- New table `email_outbox` (`to_email`, `subject`, `body`, `template_key`, `status`,
  `transport`, `error`, `complaint_id`, `created_at`, `sent_at`) with status
  `queued | sent | failed | skipped`.
- QR codes and share links need no storage — they are derived from the complaint id.

---

## 3. API changes

The browser uses `POST /api/rpc` with `{ method, args, token }` and receives
`{ ok: true, result }` or `{ ok: false, error: { code, message } }`.

### New / extended RPC methods

| Method | Role | Purpose |
| --- | --- | --- |
| `officerLogin` | public | Officer sign-in; resident/admin accounts are rejected here. |
| `acceptComplaint` | admin or assigned officer | Pending → Accepted. |
| `checkDuplicates` | signed-in | Nearby same-category complaints by GPS/haversine and image fingerprint. |
| `verifyComplaint` | owner or admin | Yes → Closed, No → Reopened + admin notification. Returns verification history. |
| `officerDashboard` | officer | Workload stats and recently assigned complaints. |
| `listOfficerComplaints` | officer | Assigned complaint list with filters. |
| `getOfficerComplaint` | officer | Assigned complaint detail (403 for other officers). |
| `updateOfficerStatus` | officer | Status change with note and history. |
| `resolveOfficerComplaint` | officer | Resolved + citizen verification request. |
| `updateOfficerWork` | officer | Before/after photos and work notes. |
| `officerProfile` | officer | Current officer profile. |
| `updateComplaintWork` | admin only | Admin upload/update of before/after photos and notes. |
| `listEmailOutbox` | admin only | Recent queued/sent emails. |
| `analytics` | admin only | Monthly, daily, category, ward, resolution buckets, officer performance, trend, top complaints. |

Extended existing methods:

- `listComplaints`: filters `assignedOfficerId`, `representativeId`, `priority`,
  `verificationStatus`, `unassignedOfficer`, `from`, `to`; search also matches
  citizen name, category label, ward, representative/MLA and officer name/code.
- `getComplaint`: representative/MLA/office details, `wardZone`, verification
  history, assignments, timeline, AI metadata and duplicate link.
- `createComplaint`: `imageFingerprint`, `aiWasteType`, `aiConfidence`,
  optional duplicate-of link; auto-routes ward → officer when enabled.
- `saveWard` / `deleteWard`: accept/return `assignedOfficerId`.
- `saveRepresentative`: accepts/returns `mlaName` and `officeAddress`.
- `getSettings` / `saveSettings`: `emailNotifications` and `emailTemplates`.
- `listNotifications`: unchanged shape, now also fed by workflow events.

### REST routes

- `POST /api/officer/login`
- `GET /api/officer/dashboard`
- `GET /api/officer/complaints`, `GET /api/officer/complaints/:id`
- `PATCH /api/officer/complaints/:id/status`
- `POST /api/officer/complaints/:id/work`
- `GET /api/officers` (admin directory)

All officer routes require an officer JWT; admin-only routes are guarded by
`requireRole("admin")`, and officers never receive delete/user endpoints.

---

## 4. Feature behaviour

1. **Workflow** — `Pending → Accepted → Assigned → In-Progress → Resolved →
   Citizen Verification → Closed`, plus `Reopened` and `Rejected`. Every change
   writes `status_history` + `complaint_timeline` with actor and timestamp.
2. **Before/after photos** — officer console and admin complaint page accept
   both images (resized client-side). The details page shows them side by side.
   Citizens receive `FORBIDDEN` if they call the upload APIs.
3. **Live status** — `utils/live.js` publishes after every successful write;
   `useService` refreshes silently (180 ms coalescing) and a `storage` event
   extends this across tabs. Status badges are colour-coded, including Accepted.
4. **Notifications** — submitted, accepted, assigned, work started, resolved,
   closed, reopened. Written to `notifications` and shown on the Alerts page.
5. **Officer module** — separate login, dashboard, assigned list, status,
   photos, work notes, resolve. No delete/users/admin access.
6. **Ward management** — admin CRUD plus assigned officer and representative;
   new complaints route to the ward's officer and representative automatically.
7. **Representative module** — ward, corporator, MLA, phone, office, optional
   email shown on complaint details.
8. **Citizen verification** — resolved complaints ask “Has your issue been
   resolved?”. Yes closes; No reopens and notifies admins; all decisions are kept
   in `verification_history` and rendered on the details page.
9. **Heat map** — client-side ~1.1 km grid: green ≤ 2 reports, yellow ≤ 5, red > 5;
   markers/heat toggle and live refresh.
10. **Search & filters** — ID, citizen, ward, address, category, representative,
    officer name/code; status/category/date/ward/officer filters.
11. **Analytics** — monthly, daily, category, ward, resolution-time buckets,
    officer performance table and cumulative trend.
12. **AI waste detection** — advisory browser heuristic + optional `WASTE_AI_URL`;
    results stored as metadata. Failure never blocks submission.
13. **Duplicates** — SQL haversine nearby query + exact image fingerprint.
    Matching complaints offer “Me Too”, which upvotes the original.
14. **QR code** — generated in the browser for the exact complaint URL.
15. **Sharing** — WhatsApp, Facebook, X and copy-link chips.
16. **Multi-language** — English/Hindi dictionaries with `localStorage`
    persistence; add a language by adding one object to `i18n/translations.js`.
17. **Reports** — complaint, ward and monthly reports as CSV and PDF (jsPDF).
18. **Email** — configurable templates; SMTP when configured, otherwise queued in
    `email_outbox` so nothing is lost.

---

## 5. Testing steps

Start with `npm run db:setup` and `npm start`, then open
`http://localhost:5000`. Use a hard refresh after a rebuild.

### 1. Complaint workflow + timeline

1. Sign in as the resident and open a Pending complaint.
2. Sign in as admin → Complaints → Manage → change status and save.
3. Reload the complaint; the new status appears.
4. The timeline shows each status, note, actor and timestamp; `status_history`
   keeps the from/to pair.

Expected: every transition is recorded; invalid/duplicate transitions return a
validation/conflict message.

### 2. Before/after photos

1. Sign in as officer → Assigned Complaints → Manage.
2. Upload a before and an after photo and save.
3. Open the same complaint as resident/admin.

Expected: both photos appear side by side under “Sanitation work”. A resident
calling `/api/rpc` `updateOfficerWork`/`updateComplaintWork` gets `FORBIDDEN`.

### 3. Live status + badges

1. Open the same complaint in two tabs.
2. Change the status or post a comment in one tab.

Expected: the other tab refreshes within ~1 second without a manual reload.
Badges are distinct for Pending (amber), Accepted (teal), Assigned (blue),
In-Progress, Resolved (green), Closed (slate), Reopened (red), Rejected (grey).

### 4. Notifications

1. Submit a complaint as a resident.
2. Accept, assign and resolve it as admin/officer.
3. Open Alerts as the resident.

Expected: one notification per event with title, body, time and a working View
link.

### 5. Officer module

1. Open `#/officer/login` and sign in with the officer demo account.
2. Check the dashboard workload cards and assigned list.
3. Update status, add work notes and resolve a complaint.

Expected: only assigned complaints are visible; no delete/user/admin links are
rendered; direct officer calls for other complaints return `FORBIDDEN`.

### 6. Ward management + routing

1. Admin → Wards → Add/Edit a ward and choose an assigned officer.
2. Submit a complaint for that ward (or with GPS near it).

Expected: the complaint shows the ward representative and the ward's officer;
`assignedOfficerId` is populated automatically.

### 7. Representative details

1. Admin → Representatives → edit MLA and office address.
2. Open a complaint in that ward.

Expected: details page shows ward, corporator, MLA, phone, office address and
optional email.

### 8. Citizen verification

1. As officer/admin resolve a complaint (`Citizen Verification`).
2. As the reporting citizen click **No, it is still an issue**.

Expected: status `Reopened`, verification history adds a “reopened” row, and the
admin receives a notification. Then resolve it again and click
**Yes, it is resolved**; status becomes `Closed` with a “verified” row.

### 9. Heat map

1. Open `#/map` and switch between Density heatmap and Markers.

Expected: green/yellow/red cells reflect report counts, the legend is visible,
popups show counts, and the page updates when complaints change.

### 10. Search & filters

1. Admin → Complaints: search by ID, citizen, ward, address, category,
   representative name and officer code (`SO-1042`).
2. Combine status, category, ward, officer, representative and date filters.

Expected: the table and “N shown” count update; Reset filters restores all rows.

### 11. Analytics

1. Admin → Analytics.

Expected: key metrics, monthly trend + resolved line, daily bars, status,
category, resolution-time buckets, officer performance table (load bar),
cumulative trend, last-7-days, waste type and ward charts.

### 12. AI waste detection

1. Resident → Report an issue → choose an image.

Expected: an advisory card with predicted waste type and confidence. If the
heuristic/server is unavailable the form still submits normally.

### 13. Duplicate detection / Me Too

1. Enable location (or choose a ward near an existing report) and choose the
   same category.
2. Upload a photo if available.

Expected: “Similar complaints nearby” lists the original with distance and
“same photo” where applicable. **Me Too** upvotes it and opens it; **This is a
different issue** hides the card so the new complaint can be submitted.

### 14. QR code

1. Open any complaint and find the QR section.

Expected: a scannable QR opens the same `#/complaint/:id` URL. Download QR saves
a PNG.

### 15. Sharing

1. Use the WhatsApp, Facebook, X and Copy link chips.

Expected: the first three open the correct share dialog; Copy link copies the
current complaint URL and shows a confirmation.

### 16. Multi-language

1. Use the language selector in the header, resident shell, admin shell, officer
   shell or map.
2. Switch to हिन्दी and back to English; reload.

Expected: navigation, statuses and page labels translate immediately and the
choice persists. Stored values (statuses, categories, wards) remain English.

### 17. Reports

1. Admin → Reports.
2. Choose Complaint, Ward and Monthly reports.
3. Click Export CSV and Export PDF.

Expected: CSV downloads with the expected columns; the PDF is a valid file with
title, filters, table header, rows and page footer. Empty selections disable the
export buttons.

### 18. Email notifications

1. Admin → Settings: confirm “Send email notifications” and edit a template
   subject/body (placeholders shown on the page).
2. Submit/accept/resolve a complaint.

Expected: with SMTP configured the message is sent; otherwise it is queued and
visible in the Email outbox with template key, recipient, status and time.
Restoring a template body replaces it with the built-in default.

---

## 6. Demo data notes

- Seeded complaints 1–5 plus any complaints created through the app are kept.
- Complaint 2 was used to exercise the full verification loop and is now
  `Closed`; its verification history shows requested → reopened → verified.
- No test photos or test work notes remain on the seeded complaints.
- `email_outbox` contains only real workflow messages.
