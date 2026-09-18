-- VDC Club · Team metadata and synced event uniqueness

ALTER TABLE teams ADD COLUMN IF NOT EXISTS venue text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_type text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_events_source_external_unique
  ON club_events(source,external_id)
  WHERE external_id IS NOT NULL;
