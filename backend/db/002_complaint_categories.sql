-- Extend complaints with civic category and issue type.
-- The legacy waste_type column/field is intentionally kept for backward
-- compatibility; it now mirrors complaint_type.

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS complaint_category text;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS complaint_type text;

-- Every complaint created before this migration was a garbage report.
UPDATE complaints
SET complaint_category = 'garbage-collection'
WHERE complaint_category IS NULL;

UPDATE complaints
SET complaint_type = waste_type
WHERE complaint_type IS NULL;

ALTER TABLE complaints ALTER COLUMN complaint_category SET DEFAULT 'garbage-collection';
ALTER TABLE complaints ALTER COLUMN complaint_category SET NOT NULL;
ALTER TABLE complaints ALTER COLUMN complaint_type SET NOT NULL;

-- The old constraint only allowed the seven legacy garbage values, but
-- waste_type now mirrors the wider set of issue labels.
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_waste_type_check;

-- Recreate the length guards so they also apply to databases that were
-- created before these columns existed.
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_complaint_category_length;
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_complaint_type_length;

ALTER TABLE complaints
  ADD CONSTRAINT complaints_complaint_category_length
  CHECK (char_length(complaint_category) BETWEEN 2 AND 60);

ALTER TABLE complaints
  ADD CONSTRAINT complaints_complaint_type_length
  CHECK (char_length(complaint_type) BETWEEN 2 AND 80);

CREATE INDEX IF NOT EXISTS complaints_category_idx ON complaints (complaint_category);
CREATE INDEX IF NOT EXISTS complaints_type_idx ON complaints (complaint_type);
