-- 005 Aadhaar-based citizen verification.
-- Additive only: existing accounts, columns and rows are preserved. Aadhaar is
-- stored encrypted (aadhaar_number) with a one-way lookup hash; the UI only
-- ever receives the last four digits.

/* ------------------------ citizen identity columns ---------------------- */

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS aadhaar_number text,
  ADD COLUMN IF NOT EXISTS aadhaar_last4 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aadhaar_hash text,
  ADD COLUMN IF NOT EXISTS aadhaar_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aadhaar_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS verification_remarks text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aadhaar_submitted_at timestamptz;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_verification_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_verification_status_check
  CHECK (verification_status IN ('Pending', 'Verified', 'Rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS users_aadhaar_hash_unique
  ON users (aadhaar_hash)
  WHERE aadhaar_hash IS NOT NULL AND aadhaar_hash <> '';

CREATE INDEX IF NOT EXISTS users_verification_status_idx
  ON users (verification_status)
  WHERE role = 'user';

/* ------------------------- optional citizen email ----------------------- */

ALTER TABLE users ALTER COLUMN email SET DEFAULT '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_email_lower_unique;

-- Only real addresses are unique; several residents may leave email blank.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (lower(email))
  WHERE email <> '';

/* --------------------- grandfather existing accounts -------------------- */

-- Accounts created before Aadhaar verification existed keep working. Their
-- demo identity is marked verified with a placeholder last-four value; no
-- Aadhaar number is invented or stored for them.
UPDATE users
SET verification_status = 'Verified',
    aadhaar_verified = true,
    aadhaar_verified_at = COALESCE(aadhaar_verified_at, updated_at, created_at, now()),
    aadhaar_last4 = CASE
      WHEN role = 'user' AND aadhaar_last4 = '' THEN '1234'
      ELSE aadhaar_last4
    END,
    verification_remarks = CASE
      WHEN verification_remarks = '' THEN 'Existing account verified before the Aadhaar rollout.'
      ELSE verification_remarks
    END
WHERE verification_status = 'Pending'
  AND aadhaar_hash IS NULL;
