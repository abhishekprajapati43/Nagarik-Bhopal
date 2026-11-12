-- 006 Ward master data.
-- Additive only: the legacy ward columns (name, area, zone, center_lat/lng,
-- representative_id, assigned_officer_id) stay in place so every existing
-- complaint, resident and officer link keeps working. The new columns describe
-- the BMC ward master (ward number, zone number, assembly constituency and the
-- elected councillor) and mark the imported BMC wards as protected.

ALTER TABLE wards
  ADD COLUMN IF NOT EXISTS ward_number integer,
  ADD COLUMN IF NOT EXISTS zone_number integer,
  ADD COLUMN IF NOT EXISTS assembly_constituency text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS councillor_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS councillor_mobile text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS population integer,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

/* --------------------------- value constraints -------------------------- */

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_name_length;
ALTER TABLE wards
  ADD CONSTRAINT wards_name_length
  CHECK (char_length(name) BETWEEN 2 AND 80);

-- `zone` now stores the BMC zone label ("Zone 1"…"Zone 19"). The five compass
-- values are kept valid because older rows and the demo data used them.
ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_zone_check;
ALTER TABLE wards
  ADD CONSTRAINT wards_zone_check CHECK (
    zone IN ('North', 'South', 'East', 'West', 'Central')
    OR zone ~ '^Zone [0-9]{1,2}$'
  );

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_ward_number_check;
ALTER TABLE wards
  ADD CONSTRAINT wards_ward_number_check
  CHECK (ward_number IS NULL OR ward_number BETWEEN 1 AND 200);

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_zone_number_check;
ALTER TABLE wards
  ADD CONSTRAINT wards_zone_number_check
  CHECK (zone_number IS NULL OR zone_number BETWEEN 1 AND 30);

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_population_check;
ALTER TABLE wards
  ADD CONSTRAINT wards_population_check
  CHECK (population IS NULL OR population >= 0);

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_councillor_mobile_length;
ALTER TABLE wards
  ADD CONSTRAINT wards_councillor_mobile_length
  CHECK (char_length(councillor_mobile) <= 20);

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_assembly_constituency_length;
ALTER TABLE wards
  ADD CONSTRAINT wards_assembly_constituency_length
  CHECK (char_length(assembly_constituency) <= 80);

ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_councillor_name_length;
ALTER TABLE wards
  ADD CONSTRAINT wards_councillor_name_length
  CHECK (char_length(councillor_name) <= 80);

/* ------------------------- backfill legacy rows ------------------------- */

-- Existing demo wards are named "Ward 07" etc. Recover their numbers so the
-- import can update the same rows instead of duplicating them.
UPDATE wards
SET ward_number = substring(name from '([0-9]{1,3})')::int
WHERE ward_number IS NULL
  AND name ~* '^ward[ -]?[0-9]{1,3}$'
  AND substring(name from '([0-9]{1,3})')::int BETWEEN 1 AND 200;

UPDATE wards
SET zone_number = substring(zone from '([0-9]{1,2})')::int
WHERE zone_number IS NULL
  AND zone ~ '^Zone [0-9]{1,2}$';

UPDATE wards w
SET councillor_name = CASE WHEN w.councillor_name = '' THEN r.name ELSE w.councillor_name END,
    councillor_mobile = CASE WHEN w.councillor_mobile = '' THEN r.phone ELSE w.councillor_mobile END
FROM representatives r
WHERE r.id = w.representative_id;

-- Legend rows that predate the ward master are treated as protected BMC wards
-- so an administrator cannot accidentally delete them.
UPDATE wards SET is_default = true WHERE ward_number IS NOT NULL;

/* ------------------------------- indexes -------------------------------- */

-- The wards table is on the referenced side of a DEFERRABLE foreign key
-- (representatives.ward_id). Flush any queued trigger events before the DDL
-- below, otherwise PostgreSQL rejects CREATE INDEX with "pending trigger
-- events" when the backfill above ran in the same transaction.
SET CONSTRAINTS ALL IMMEDIATE;

CREATE UNIQUE INDEX IF NOT EXISTS wards_ward_number_unique
  ON wards (ward_number) WHERE ward_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS wards_zone_number_idx ON wards (zone_number);
CREATE INDEX IF NOT EXISTS wards_assembly_constituency_idx
  ON wards (lower(assembly_constituency));
CREATE INDEX IF NOT EXISTS wards_councillor_name_idx
  ON wards (lower(councillor_name));
CREATE INDEX IF NOT EXISTS wards_name_lower_idx ON wards (lower(name));
CREATE INDEX IF NOT EXISTS wards_area_lower_idx ON wards (lower(area));
