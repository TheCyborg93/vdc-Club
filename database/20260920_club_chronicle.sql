-- VDC Club · Vereinschronik, Hall of Fame, Erfolge und Galerie

CREATE TABLE IF NOT EXISTS club_honors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  honor_type text NOT NULL CHECK (honor_type IN ('club_champion','christmas_champion','other')),
  custom_title text,
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  event_date date,
  winner_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  winner_name text NOT NULL,
  runner_up_name text,
  third_place_name text,
  participants integer CHECK (participants IS NULL OR participants >= 0),
  notes text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (honor_type, custom_title, year)
);

CREATE TABLE IF NOT EXISTS club_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achieved_on date NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_photo_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date,
  description text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES club_photo_albums(id) ON DELETE CASCADE,
  title text,
  caption text,
  storage_ref text NOT NULL,
  mime_type text NOT NULL,
  original_filename text NOT NULL,
  file_size_bytes bigint NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  uploaded_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_honors_year ON club_honors(year DESC,event_date DESC);

CREATE INDEX IF NOT EXISTS idx_club_achievements_date ON club_achievements(achieved_on DESC);

CREATE INDEX IF NOT EXISTS idx_club_photo_albums_date ON club_photo_albums(event_date DESC,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_photos_album ON club_photos(album_id,created_at);

DROP TRIGGER IF EXISTS trg_club_honors_updated_at ON club_honors;

CREATE TRIGGER trg_club_honors_updated_at BEFORE UPDATE ON club_honors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_club_achievements_updated_at ON club_achievements;

CREATE TRIGGER trg_club_achievements_updated_at BEFORE UPDATE ON club_achievements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_club_photo_albums_updated_at ON club_photo_albums;

CREATE TRIGGER trg_club_photo_albums_updated_at BEFORE UPDATE ON club_photo_albums FOR EACH ROW EXECUTE FUNCTION set_updated_at();
