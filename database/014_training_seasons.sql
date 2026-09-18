-- VDC Club · Configurable training seasons

CREATE TABLE IF NOT EXISTS training_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_training_seasons_active
  ON training_seasons(is_active,starts_on DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_seasons_single_active
  ON training_seasons ((1))
  WHERE is_active=true;

DROP TRIGGER IF EXISTS trg_training_seasons_updated_at ON training_seasons;
CREATE TRIGGER trg_training_seasons_updated_at
  BEFORE UPDATE ON training_seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO training_seasons (
  label,starts_on,ends_on,is_active,notes
)
VALUES (
  '2026/27',
  DATE '2026-07-01',
  DATE '2027-06-30',
  true,
  'Standardzeitraum für die Trainingsauswertung. Start und Ende können im Training angepasst werden.'
)
ON CONFLICT (label)
DO UPDATE SET is_active=true;
