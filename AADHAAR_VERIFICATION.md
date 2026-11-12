# Aadhaar Citizen Verification

Aadhaar-based identity verification added to Nagarik Bhopal without changing the
existing folder structure, authentication flow, dashboards or complaint
workflow. Login still uses mobile/email + password; Aadhaar is collected only at
registration or when a resident completes/retries verification on their profile.

> **Existing data is preserved.** The change is additive: no existing column,
> table, route, page or seeded account was removed. Accounts created before this
> rollout are grandfathered as `Verified` so residents can keep reporting.

Demo accounts are unchanged:

| Role | Email | Password |
| --- | --- | --- |
| Resident | `citizen@nagarik.bhopal` | `Citizen@123` |
| Administrator | `admin@nagarik.bhopal` | `Admin@123` |
| Sanitation Officer | `officer@nagarik.bhopal` | `Officer@123` |

---

## 1. What changed for users

### Registration

| Field | Rule |
| --- | --- |
| Full name | Required, 2–60 characters |
| Mobile number | **Required**, exactly 10 digits; one account per number |
| Email | Optional; when present it must be valid and unique |
| Aadhaar number | **Required**, exactly 12 digits (spaces/hyphens ignored); one account per Aadhaar |
| Password / Confirm password | Existing password policy; both must match |

The browser validates before submitting and the API validates again. New
registrations always start as **Pending**.

### Login

Unchanged. Residents sign in with email or mobile + password. Staff continue to
use the admin/officer sign-in pages. Aadhaar is never requested at login.

### Complaint submission gate

Only `verificationStatus = Verified` residents can submit a complaint. Pending
and rejected residents see the required message:

> Please complete Aadhaar verification before submitting a complaint.

The report form shows a banner with a **Complete identity verification** link,
blocks the submit handler, and the API rejects the same request with
`FORBIDDEN` so it cannot be bypassed by calling `POST /api/complaints` or the RPC
method directly.

### Profile — Identity Verification

`/profile` now has an **Identity Verification** card showing:

- status badge: **Pending** (amber), **Verified** (green) or **Rejected** (red);
- masked number only, e.g. `XXXX XXXX 1234`;
- verified date when approved;
- rejection remarks and a **Resubmit Aadhaar** form when rejected;
- a one-time **Submit for verification** form while pending.

A verified resident cannot resubmit. The full Aadhaar number is never rendered,
returned or logged.

### Admin — Citizen Verification

New admin page `/admin/citizen-verification` (sidebar link **Citizen
Verification**) lists residents with:

- search by name, mobile, ward or last four digits;
- status filter (All / Pending / Verified / Rejected);
- masked Aadhaar, submission time, status and remarks;
- **Approve** / **Reject** with remarks (rejection remarks are required);
- **History** showing action, administrator name, date/time, result and remarks.

Administrators see only `XXXX XXXX 1234`. There is no download/export control
and no API response contains the encrypted number or lookup hash.

---

## 2. Files created

### Backend

| File | Purpose |
| --- | --- |
| `backend/db/005_aadhaar_verification.sql` | Additive schema migration: identity columns, constraints, indexes, optional-email index, grandfathering. |
| `backend/utils/aadhaar.js` | AES-256-GCM encryption/decryption, HMAC-SHA256 lookup hash, 12-digit normalisation, mask helper. |
| `backend/services/verification.service.js` | Admin list/review/history with masked-only output, notifications and audit rows. |

### Frontend / shared

| File | Purpose |
| --- | --- |
| `shared/aadhaar.js` | Browser-side Web Crypto parity for the offline localStorage demo (AES-GCM + SHA-256 lookup hash + mask). |
| `pages/admin/AdminCitizenVerification.jsx` | Admin verification queue, review form and audit history. |

---

## 3. Files modified

### Backend

| File | Change |
| --- | --- |
| `backend/db/migrate.js` | Registers migration `005_aadhaar_verification`. |
| `backend/db/schema.sql` | Canonical `users` table gains Aadhaar columns, verification CHECK constraint, Aadhaar/status indexes, and optional-email partial unique index. |
| `backend/db/seed.js` | Seeds demo residents with grandfathered `Verified` status and synthetic last four digits. |
| `backend/config/env.js` | Reads optional `AADHAAR_ENCRYPTION_KEY` / `AADHAAR_LOOKUP_KEY`; warns when the demo fallback is used. |
| `backend/repositories/user.repository.js` | Optional-email lookup, Aadhaar duplicate lookup, create with identity fields, `updateAadhaar`, `reviewAadhaar`, verification list and audit queries. |
| `backend/utils/serialize.js` | `publicUser` exposes masked Aadhaar fields only; new `citizenVerification` serializer. |
| `backend/services/auth.service.js` | Registration requires mobile + Aadhaar, optional email, duplicate checks, encryption/hash, Pending status, notifications and audit; new `submitAadhaar`. |
| `backend/services/complaint.service.js` | Rejects complaint creation for unverified residents with the exact required message. |
| `backend/services/rpc.service.js` | Adds `submitAadhaar`, `listCitizenVerifications`, `reviewCitizenVerification`, `listVerificationAudit`. |
| `backend/controllers/auth.controller.js` | `submitAadhaar` handler. |
| `backend/routes/auth.routes.js` | `POST /api/auth/aadhaar`. |
| `.env.example` | Documents the two optional Aadhaar keys. |

### Frontend / shared

| File | Change |
| --- | --- |
| `shared/validation.js` | Shared `mobileNumber`, `optionalEmail`, `aadhaarNumber` validators. |
| `shared/constants.js` | `AADHAAR_STATUS` / `AADHAAR_STATUS_LIST`. |
| `shared/service.js` | Offline-mode parity: registration, profile submission, admin review/history, grandfathering, complaint gate, service method list. |
| `shared/rpc.js` | RBAC entries for the new methods (session-only vs admin-only). |
| `shared/seed.js` | Demo residents seeded as verified with synthetic last4. |
| `utils/api.js` | Marks the verification read methods as non-mutating (no live-refresh loop). |
| `context/AuthContext.jsx` | Exposes `submitAadhaar` and refreshes the stored user. |
| `pages/Register.jsx` | Required mobile + Aadhaar fields, optional email, client validation. |
| `pages/Profile.jsx` | Identity Verification card, masked status, rejection remarks, resubmit form. |
| `components/ReportComplaint.jsx` | Pending/rejected banner and blocked submit message. |
| `App.jsx` | `/admin/citizen-verification` route. |
| `pages/admin/AdminLayout.jsx` | Sidebar link. |
| `pages/admin/admin.css`, `index.css` | Verification table/review, badges and identity card styles. |
| `README.md`, `backend/README.md`, `ADVANCED_FEATURES.md` | Documentation links and updated endpoint/schema notes. |

---

## 4. Database schema changes

Migration: `backend/db/005_aadhaar_verification.sql` (applied by
`npm run db:setup` / server start, tracked in `schema_migrations`).

New columns on `users` (existing columns untouched):

| Column | Type | Notes |
| --- | --- | --- |
| `aadhaar_number` | `text` | AES-256-GCM ciphertext (`v1:iv:tag:data`); never plaintext. |
| `aadhaar_last4` | `text NOT NULL DEFAULT ''` | Only readable identity fragment, used for masking. |
| `aadhaar_hash` | `text` | HMAC-SHA256 lookup value for duplicate detection. |
| `aadhaar_verified` | `boolean NOT NULL DEFAULT false` | Fast gate for complaint submission. |
| `aadhaar_verified_at` | `timestamptz` | Approval timestamp. |
| `verification_status` | `text NOT NULL DEFAULT 'Pending'` | `Pending` / `Verified` / `Rejected` (CHECK constraint). |
| `verification_remarks` | `text NOT NULL DEFAULT ''` | Most recent admin remark/rejection reason. |
| `aadhaar_submitted_at` | `timestamptz` | Last submission time, used to sort the queue. |

Indexes / constraints:

- `users_aadhaar_hash_unique` — partial unique index on `aadhaar_hash` where not
  null/empty (one account per Aadhaar).
- `users_verification_status_idx` — partial index for resident queues.
- `users_verification_status_check` — allowed status values.
- `users_email_lower_unique` — replaced the old unconditional unique constraint
  with `WHERE email <> ''`, so email can be blank on many accounts while real
  addresses stay unique.

Grandfathering: existing accounts with no Aadhaar hash are marked `Verified`, get
the old `updated_at`/`created_at` as verification time, and demo residents get
the placeholder last four `1234` (extra seeded residents use `5678` / `9012`).
No Aadhaar number is invented or stored for them.

### Rollback

The migration is additive, so a rollback is only needed to remove the feature:

```sql
DROP INDEX IF EXISTS users_aadhaar_hash_unique;
DROP INDEX IF EXISTS users_verification_status_idx;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_verification_status_check,
  DROP COLUMN IF EXISTS aadhaar_number,
  DROP COLUMN IF EXISTS aadhaar_last4,
  DROP COLUMN IF EXISTS aadhaar_hash,
  DROP COLUMN IF EXISTS aadhaar_verified,
  DROP COLUMN IF EXISTS aadhaar_verified_at,
  DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS verification_remarks,
  DROP COLUMN IF EXISTS aadhaar_submitted_at;
-- Restore the old email rule only if every account has a non-empty email.
```

---

## 5. API changes

### REST

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Now requires `name`, `phone`, `aadhaarNumber`, `password`; `email` and `wardId` optional. Returns the user with masked Aadhaar and `Pending` status. |
| `POST` | `/api/auth/aadhaar` | Resident JWT | `{ aadhaarNumber }`; submits or retries verification. Rejected accounts return to `Pending`. |
| `POST` | `/api/complaints` | Resident JWT | Returns `403 FORBIDDEN` with the required message until the resident is verified. |

### RPC (`POST /api/rpc`)

New methods, all using the existing `{ method, args, token }` envelope:

| Method | Access | Purpose |
| --- | --- | --- |
| `submitAadhaar` | Any signed-in resident | Profile submission/retry. |
| `listCitizenVerifications` | Admin | `{ status?, search? }`; masked Aadhaar only. |
| `reviewCitizenVerification` | Admin | `{ userId, decision: "Verified"\|"Rejected", remarks? }`. |
| `listVerificationAudit` | Admin | `{ userId }`; action, admin name, time, result, remarks. |

`me`, `register`, and `updateProfile` now return `aadhaarLast4`,
`aadhaarMasked`, `aadhaarVerified`, `aadhaarVerifiedAt`,
`aadhaarSubmittedAt`, `verificationStatus` and `verificationRemarks`.
`aadhaarNumber`, `aadhaar_number` and `aadhaar_hash` are never serialized.

### Error responses

| Situation | Code | Message |
| --- | --- | --- |
| Missing / invalid Aadhaar | `VALIDATION` | `Aadhaar number is required.` / `Aadhaar number must contain exactly 12 digits.` |
| Duplicate Aadhaar | `CONFLICT` | `That Aadhaar number is already registered.` |
| Duplicate mobile | `CONFLICT` | `That mobile number is already registered.` |
| Invalid email | `VALIDATION` | `Enter a valid email address.` |
| Unverified complaint | `FORBIDDEN` | `Please complete Aadhaar verification before submitting a complaint.` |
| Rejection without remarks | `VALIDATION` | `Add a remark explaining why the Aadhaar verification was rejected.` |
| Citizen/officer calls admin methods | `FORBIDDEN` | `Administrator access is required.` |
| Decryption failure | `INTERNAL` | `Stored Aadhaar data could not be decrypted with the configured key.` |

---

## 6. Security model

- **Encryption at rest.** Aadhaar is encrypted in Node with AES-256-GCM before
  the `INSERT`/`UPDATE`. The stored value is versioned (`v1:iv:tag:ciphertext`)
  and uses a random 96-bit IV per record. Keys derive from
  `AADHAAR_ENCRYPTION_KEY`; the lookup HMAC uses `AADHAAR_LOOKUP_KEY`.
- **Production keys.** Set both variables to independent 32-byte random values
  (see `.env.example`). If they are absent the server derives keys from
  `JWT_SECRET` and logs a warning; this is a development fallback only.
- **Duplicate detection without decryption.** Registration and resubmission
  compare an HMAC-SHA256 lookup hash. No query ever searches plaintext Aadhaar.
- **Masking everywhere.** The serializers only expose `aadhaarLast4` and
  `aadhaarMasked` (`XXXX XXXX 1234`). Admin lists, audit history, notifications
  and error messages use the same mask. There is no export/download path.
- **Role enforcement.** `listCitizenVerifications`, `reviewCitizenVerification`
  and `listVerificationAudit` call `requireAdmin` in the service and are marked
  admin-only in the shared RPC gate. Officers and residents receive `FORBIDDEN`
  even if they craft the RPC directly. Residents can only read their own
  masked status through `me`/`publicUser`.
- **Complaint gate.** Enforced in both `backend/services/complaint.service.js`
  and `shared/service.js`, so the API and offline demo behave identically.
- **Audit trail.** `audit_logs` records `aadhaar.submitted`, `aadhaar.verified`
  and `aadhaar.rejected` with `entity = 'user'`, the citizen id, actor id (the
  admin for decisions), IP/user-agent, last four digits and remarks.
- **No plaintext logging.** The service never logs the number; warnings and
  errors only mention the last four.
- **Offline parity.** The browser demo uses Web Crypto AES-GCM with a
  device-local demo key and a one-way lookup digest. Ciphertext is never shared
  between browser storage and PostgreSQL.

---

## 7. Notifications

| Event | Recipient | Type |
| --- | --- | --- |
| Registration submitted | Citizen | `system` |
| Profile Aadhaar submitted/resubmitted | Citizen | `system` |
| New verification request | All admins | `admin` |
| Verification approved | Citizen | `system` |
| Verification rejected (includes remarks) | Citizen | `admin` |

Notifications appear in `/notifications` with the existing notification UI.

---

## 8. Testing steps

### Automated API smoke test (39 checks)

The verification run covered: missing/11-digit/letter Aadhaar, invalid email,
short password, successful registration, masked-only response, duplicate Aadhaar,
duplicate mobile, registration without email, pending complaint rejection,
`me` masking, citizen/officer RBAC denial, pending queue + search, rejection
remarks requirement, approval, verified complaint submission, rejection with
remarks, resubmission after rejection, duplicate resubmission, verified-user
resubmit block, audit history (action/admin/result/remarks), notification
generation, ciphertext/hash/last4 storage, no plaintext Aadhaar, no duplicate
hashes, and cleanup. Result: **39/39 passed**.

### Manual walkthrough

1. **Register** at `#/register`:
   - submit without Aadhaar → client message about 12 digits;
   - submit `12345678901` → same message;
   - submit a valid 12-digit Aadhaar, 10-digit mobile, blank email → account
     created and redirected to the dashboard.
2. **Profile** → Identity Verification: **Pending** badge, `XXXX XXXX 1234`
   mask, only the last four digits visible; no full number in the DOM or API.
3. **Report** → banner says “Please complete Aadhaar verification before
   submitting a complaint.” Clicking submit shows the same message.
4. **Admin** → Citizen Verification:
   - pending row shows the citizen, ward, masked Aadhaar and submission time;
   - **Approve** → success message, row leaves the pending filter;
   - **Reject** without remarks → validation message; with remarks → status
     becomes Rejected and remarks appear;
   - **History** shows action, admin name, date/time, result and remarks.
5. **Citizen refresh** → **Verified** badge and verified date; the report banner
   is gone and a complaint can be submitted.
6. **Rejected citizen** → **Rejected** badge, remarks and **Resubmit Aadhaar**;
   submitting a new 12-digit number returns the account to Pending.
7. **Notifications** → submitted / approved / rejected entries are present.
8. **RBAC** → officer or citizen calling `listCitizenVerifications`,
   `reviewCitizenVerification` or `listVerificationAudit` gets `FORBIDDEN`; the
   officer console has no Aadhaar screen and no Aadhaar fields.
9. **Database check** (`psql`):

   ```sql
   SELECT aadhaar_last4, verification_status,
          left(aadhaar_number, 3) AS cipher_prefix,
          length(aadhaar_hash) AS hash_len
   FROM users WHERE role = 'user';

   -- Must return 0 rows: no plaintext Aadhaar stored.
   SELECT count(*) FROM users WHERE aadhaar_number ~ '^\d{12}$';
   ```

10. **Duplicate checks** → registering the same Aadhaar with a different mobile
    returns “That Aadhaar number is already registered.”; the same mobile with a
    different Aadhaar returns “That mobile number is already registered.”

### Offline demo (optional)

Build with `VITE_DATA_MODE=device` and repeat steps 1–8. The browser uses
`shared/aadhaar.js` (Web Crypto) and stores only encrypted text plus the lookup
hash in localStorage; seeded accounts are grandfathered as Verified.

---

## 9. Operational notes

- Run `npm run db:setup` once to apply migration 005, then `npm start`.
- Run `npm run build` after UI changes; the built bundle is served from
  `assets/app.js` and `assets/app.css`.
- `AADHAAR_ENCRYPTION_KEY` must stay stable: changing it makes previously stored
  ciphertext unreadable. Rotation requires re-encrypting existing rows while the
  old key is still configured.
- The Aadhaar gate is intentionally limited to resident complaint creation;
  reading complaints, commenting, upvoting and notifications remain available
  to pending residents.
