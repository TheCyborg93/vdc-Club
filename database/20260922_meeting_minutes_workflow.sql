-- VDC Club · Schriftführer-Workflow für Vorstandssitzungen

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS chair_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minute_taker_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minutes_intro text,
  ADD COLUMN IF NOT EXISTS minutes_closing text,
  ADD COLUMN IF NOT EXISTS minutes_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS minutes_return_note text,
  ADD COLUMN IF NOT EXISTS minutes_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_submitted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minutes_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_approved_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minutes_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_archived_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minutes_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='meetings_minutes_status_check'
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_minutes_status_check
      CHECK (minutes_status IN ('draft','review','approved','archived'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meeting_minutes_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL,
  intro text,
  closing text,
  return_note text,
  changed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id,version)
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_revisions_meeting
  ON meeting_minutes_revisions(meeting_id,version DESC);
