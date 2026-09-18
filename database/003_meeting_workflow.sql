-- VDC Club · Calendar / meeting / resolution workflow

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES club_events(id) ON DELETE SET NULL;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS resolution_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resolutions_number_unique
  ON resolutions(resolution_number)
  WHERE resolution_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_event_id ON meetings(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_type, source_id);
