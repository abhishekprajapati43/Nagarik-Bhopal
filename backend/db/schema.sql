-- Nagarik Bhopal - PostgreSQL schema
-- Applied once by backend/db/migrate.js and tracked in schema_migrations.

CREATE TABLE IF NOT EXISTS wards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  area text NOT NULL,
  zone text NOT NULL DEFAULT 'Central',
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  representative_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wards_name_unique UNIQUE (name),
  CONSTRAINT wards_name_length CHECK (char_length(name) BETWEEN 2 AND 40),
  CONSTRAINT wards_area_length CHECK (char_length(area) BETWEEN 2 AND 60),
  CONSTRAINT wards_zone_check CHECK (zone IN ('North', 'South', 'East', 'West', 'Central')),
  CONSTRAINT wards_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
  CONSTRAINT wards_center_lng_check CHECK (center_lng BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS representatives (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  designation text NOT NULL DEFAULT 'Ward Corporator',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  ward_id text REFERENCES wards(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representatives_name_length CHECK (char_length(name) BETWEEN 2 AND 80)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wards_representative_fk'
  ) THEN
    ALTER TABLE wards
      ADD CONSTRAINT wards_representative_fk
      FOREIGN KEY (representative_id)
      REFERENCES representatives(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  ward_id text REFERENCES wards(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  password_hash text NOT NULL,
  token_version integer NOT NULL DEFAULT 0,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_role_check CHECK (role IN ('user', 'admin')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'blocked')),
  CONSTRAINT users_name_length CHECK (char_length(name) BETWEEN 2 AND 60)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users ((right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)))
  WHERE phone <> '';
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS complaints (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  waste_type text NOT NULL,
  description text NOT NULL,
  address text NOT NULL,
  ward_id text REFERENCES wards(id) ON DELETE RESTRICT,
  representative_id text REFERENCES representatives(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pending',
  priority text NOT NULL DEFAULT 'Medium',
  image text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaints_status_check CHECK (status IN ('Pending', 'In-Progress', 'Resolved', 'Rejected')),
  CONSTRAINT complaints_priority_check CHECK (priority IN ('Low', 'Medium', 'High')),
  CONSTRAINT complaints_waste_type_check CHECK (
    waste_type IN (
      'Mixed Waste',
      'Plastic',
      'Wet Waste',
      'Dry Waste',
      'Construction Waste',
      'Dead Animal',
      'E-Waste'
    )
  ),
  CONSTRAINT complaints_address_length CHECK (char_length(address) BETWEEN 5 AND 160),
  CONSTRAINT complaints_description_length CHECK (char_length(description) BETWEEN 10 AND 600),
  CONSTRAINT complaints_position_check CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT complaints_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT complaints_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS complaints_user_idx ON complaints (user_id);
CREATE INDEX IF NOT EXISTS complaints_ward_idx ON complaints (ward_id);
CREATE INDEX IF NOT EXISTS complaints_representative_idx ON complaints (representative_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status);
CREATE INDEX IF NOT EXISTS complaints_created_at_idx ON complaints (created_at DESC);

CREATE TABLE IF NOT EXISTS complaint_upvotes (
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (complaint_id, user_id)
);

CREATE INDEX IF NOT EXISTS complaint_upvotes_user_idx ON complaint_upvotes (user_id);

CREATE TABLE IF NOT EXISTS complaint_comments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS complaint_comments_complaint_idx
  ON complaint_comments (complaint_id, created_at);

CREATE TABLE IF NOT EXISTS complaint_timeline (
  id bigserial PRIMARY KEY,
  complaint_id text NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_name text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaint_timeline_complaint_idx
  ON complaint_timeline (complaint_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  complaint_id text REFERENCES complaints(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (
    type IN ('system', 'complaint', 'status', 'upvote', 'comment', 'admin', 'broadcast')
  ),
  CONSTRAINT notifications_title_length CHECK (char_length(title) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id) WHERE is_read = false;

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_valid_idx
  ON password_reset_tokens (token_hash) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS uploads (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  filename text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads (user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users', 'wards', 'representatives', 'complaints', 'app_settings']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_' || table_name || '_updated_at'
        AND tgrelid = table_name::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        'trg_' || table_name || '_updated_at',
        table_name
      );
    END IF;
  END LOOP;
END
$$;
