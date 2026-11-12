-- 004 Advanced civic workflow, routing, verification, email and AI metadata.
-- Additive only: every new column is nullable or has a safe default and no
-- existing row is rewritten.

/* --------------------------- workflow statuses ------------------------- */

ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints
  ADD CONSTRAINT complaints_status_check CHECK (
    status IN (
      'Pending', 'Accepted', 'Assigned', 'In-Progress', 'Resolved',
      'Citizen Verification', 'Closed', 'Reopened', 'Rejected'
    )
  );

/* ------------------------- ward based routing -------------------------- */

ALTER TABLE wards
  ADD COLUMN IF NOT EXISTS assigned_officer_id text
    REFERENCES officers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wards_officer_idx ON wards (assigned_officer_id);

/* ----------------------- representative details ------------------------ */

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS mla_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS office_address text NOT NULL DEFAULT '';

/* -------------------- complaint AI / duplicate metadata ---------------- */

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS ai_waste_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_confidence double precision,
  ADD COLUMN IF NOT EXISTS image_fingerprint text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duplicate_of_id text REFERENCES complaints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_score double precision;

CREATE INDEX IF NOT EXISTS complaints_duplicate_idx ON complaints (duplicate_of_id);

/* -------------------------- verification history ----------------------- */

CREATE TABLE IF NOT EXISTS verification_history (
  id bigserial PRIMARY KEY,
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  decision text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'System',
  actor_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_history_decision_check CHECK (
    decision IN ('verified', 'reopened', 'requested')
  )
);

CREATE INDEX IF NOT EXISTS verification_history_complaint_idx
  ON verification_history (complaint_id, created_at);

-- Keep a history row for complaints that are already waiting for or past
-- citizen verification. Safe to re-run: rows are only inserted once.
INSERT INTO verification_history (complaint_id, decision, note, actor_name, created_at)
SELECT c.id, 'requested', 'Citizen verification requested.', 'System',
       COALESCE(c.resolved_at, c.updated_at, c.created_at, now())
FROM complaints c
WHERE c.verification_status IN ('pending', 'verified', 'reopened')
  AND NOT EXISTS (
    SELECT 1 FROM verification_history vh WHERE vh.complaint_id = c.id
  );

INSERT INTO verification_history (complaint_id, decision, note, actor_name, created_at)
SELECT c.id,
       CASE WHEN c.verification_status = 'verified' THEN 'verified' ELSE 'reopened' END,
       CASE
         WHEN c.verification_status = 'verified' THEN 'Citizen confirmed the issue is resolved.'
         ELSE 'Citizen reported that the issue is not resolved.'
       END,
       'Citizen',
       COALESCE(c.verified_at, c.closed_at, c.reopened_at, c.updated_at, c.created_at, now())
FROM complaints c
WHERE c.verification_status IN ('verified', 'reopened')
  AND NOT EXISTS (
    SELECT 1 FROM verification_history vh
    WHERE vh.complaint_id = c.id AND vh.decision IN ('verified', 'reopened')
  );

/* ----------------------------- email outbox ---------------------------- */

CREATE TABLE IF NOT EXISTS email_outbox (
  id bigserial PRIMARY KEY,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  template_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  transport text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  complaint_id text REFERENCES complaints(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT email_outbox_status_check CHECK (
    status IN ('queued', 'sent', 'failed', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS email_outbox_created_idx
  ON email_outbox (created_at DESC);
CREATE INDEX IF NOT EXISTS email_outbox_status_idx
  ON email_outbox (status);

/* ----------------------------- QR sharing ------------------------------ */
-- QR codes and share links are derived from the complaint id at render time,
-- so no additional storage is required.
