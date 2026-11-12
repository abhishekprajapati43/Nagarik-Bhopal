-- 003 Sanitation officer role, assignment and citizen-verification workflow.
-- Adds only the tables and columns the officer feature needs. Existing rows are
-- left untouched; new columns are nullable or have safe defaults.

/* ------------------------------- roles -------------------------------- */

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'officer'));

/* ------------------------------ officers ------------------------------ */

CREATE TABLE IF NOT EXISTS officers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_code text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT 'Sanitation Officer',
  zone text NOT NULL DEFAULT 'Central',
  phone text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officers_user_unique UNIQUE (user_id),
  CONSTRAINT officers_designation_length CHECK (char_length(designation) BETWEEN 2 AND 60),
  CONSTRAINT officers_zone_check CHECK (zone IN ('North', 'South', 'East', 'West', 'Central'))
);

CREATE UNIQUE INDEX IF NOT EXISTS officers_employee_code_unique
  ON officers (lower(employee_code)) WHERE employee_code <> '';
CREATE INDEX IF NOT EXISTS officers_active_idx ON officers (is_active);
CREATE INDEX IF NOT EXISTS officers_zone_idx ON officers (zone);

/* -------------------------- complaint columns ------------------------- */

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS assigned_officer_id text REFERENCES officers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS before_photo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS after_photo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints
  ADD CONSTRAINT complaints_status_check CHECK (
    status IN (
      'Pending', 'Assigned', 'In-Progress', 'Resolved',
      'Citizen Verification', 'Closed', 'Reopened', 'Rejected'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaints_verification_status_check'
  ) THEN
    ALTER TABLE complaints
      ADD CONSTRAINT complaints_verification_status_check CHECK (
        verification_status IN ('not_requested', 'pending', 'verified', 'reopened')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS complaints_officer_idx ON complaints (assigned_officer_id);
CREATE INDEX IF NOT EXISTS complaints_verification_idx ON complaints (verification_status);

/* ---------------------------- assignments ----------------------------- */

CREATE TABLE IF NOT EXISTS complaint_assignments (
  id bigserial PRIMARY KEY,
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  officer_id text NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  assigned_by text REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS complaint_assignments_complaint_idx
  ON complaint_assignments (complaint_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS complaint_assignments_officer_idx
  ON complaint_assignments (officer_id, assigned_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS complaint_assignments_active_unique
  ON complaint_assignments (complaint_id) WHERE active;

/* --------------------------- status history --------------------------- */

CREATE TABLE IF NOT EXISTS status_history (
  id bigserial PRIMARY KEY,
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'System',
  actor_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_history_complaint_idx
  ON status_history (complaint_id, created_at);

-- Keep the historical timeline visible in status_history for rows created
-- before this migration. The insert is skipped once any history exists.
INSERT INTO status_history (complaint_id, from_status, to_status, note, actor_name, actor_role, created_at)
SELECT ct.complaint_id, '', ct.status, ct.note, ct.actor_name, '', ct.created_at
FROM complaint_timeline ct
WHERE NOT EXISTS (SELECT 1 FROM status_history)
ORDER BY ct.created_at ASC, ct.id ASC;

/* --------------------------- updated_at ------------------------------- */

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_officers_updated_at ON officers;
CREATE TRIGGER trg_officers_updated_at
  BEFORE UPDATE ON officers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
