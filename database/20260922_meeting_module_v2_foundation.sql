-- VDC Club · Sitzungsmodul Neuaufbau – Phase A

ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS agenda_type text NOT NULL DEFAULT 'consultation',
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE agenda_items ai
 SET agenda_type='decision'
 WHERE EXISTS (
   SELECT 1 FROM resolutions r WHERE r.agenda_item_id=ai.id
 );

UPDATE agenda_items
 SET result_code=CASE
   WHEN status='done' THEN 'completed'
   WHEN status='deferred' THEN 'deferred'
   ELSE result_code
 END
 WHERE result_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agenda_items_type_check') THEN
    ALTER TABLE agenda_items
      ADD CONSTRAINT agenda_items_type_check
      CHECK (agenda_type IN ('information','consultation','decision'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agenda_items_result_code_check') THEN
    ALTER TABLE agenda_items
      ADD CONSTRAINT agenda_items_result_code_check
      CHECK (
        result_code IS NULL OR
        result_code IN ('noted','completed','deferred','no_decision')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meeting_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  changed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meeting_change_log_entity_type_check') THEN
    ALTER TABLE meeting_change_log
      ADD CONSTRAINT meeting_change_log_entity_type_check
      CHECK (entity_type IN ('meeting','attendee','guest','agenda_item','resolution','attachment','minutes'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meeting_change_log_meeting
  ON meeting_change_log(meeting_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agenda_items_type
  ON agenda_items(meeting_id,agenda_type,position);

CREATE INDEX IF NOT EXISTS idx_agenda_items_created
  ON agenda_items(meeting_id,created_at);
