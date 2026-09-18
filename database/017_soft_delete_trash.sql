-- VDC Club · Soft delete / recycle bin foundation

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE club_events
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_club_events_deleted_at ON club_events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON meetings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_training_sessions_deleted_at ON training_sessions(deleted_at);

DROP INDEX IF EXISTS idx_documents_meeting_minutes_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_meeting_minutes_unique
  ON documents(meeting_id)
  WHERE meeting_id IS NOT NULL
    AND category='Protokoll'
    AND deleted_at IS NULL;
