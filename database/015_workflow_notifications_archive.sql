-- VDC Club · Workflow, document lifecycle and notification state

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES sponsors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS review_on date,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_review_on
  ON documents(review_on);

CREATE INDEX IF NOT EXISTS idx_documents_sponsor
  ON documents(sponsor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_meeting_minutes_unique
  ON documents(meeting_id)
  WHERE meeting_id IS NOT NULL AND category='Protokoll';

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS implemented_at timestamptz,
  ADD COLUMN IF NOT EXISTS implementation_notes text;

CREATE TABLE IF NOT EXISTS user_notification_state (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,notification_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_state_user
  ON user_notification_state(user_id,updated_at DESC);

DROP TRIGGER IF EXISTS trg_notification_state_updated_at ON user_notification_state;
CREATE TRIGGER trg_notification_state_updated_at
  BEFORE UPDATE ON user_notification_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
