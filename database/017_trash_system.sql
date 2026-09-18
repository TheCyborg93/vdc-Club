-- VDC Club · unified trash / soft delete system

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

ALTER TABLE training_blackouts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE training_seasons
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_club_events_deleted_at ON club_events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON meetings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_training_sessions_deleted_at ON training_sessions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_training_blackouts_deleted_at ON training_blackouts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_training_seasons_deleted_at ON training_seasons(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sponsors_deleted_at ON sponsors(deleted_at);
CREATE INDEX IF NOT EXISTS idx_teams_deleted_at ON teams(deleted_at);

DROP INDEX IF EXISTS idx_documents_meeting_minutes_unique;
CREATE UNIQUE INDEX idx_documents_meeting_minutes_unique
  ON documents(meeting_id)
  WHERE meeting_id IS NOT NULL
    AND category='Protokoll'
    AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_training_schedule(p_until date DEFAULT (CURRENT_DATE + 365))
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO training_sessions (scheduled_at,status,source)
  SELECT
    ((d::date + r.start_time) AT TIME ZONE 'Europe/Berlin'),
    'planned',
    'schedule'
  FROM generate_series(CURRENT_DATE, p_until, interval '1 day') AS d
  JOIN training_schedule_rules r
    ON r.is_active
   AND EXTRACT(ISODOW FROM d)::int = r.weekday
  WHERE NOT EXISTS (
    SELECT 1
    FROM training_blackouts b
    WHERE b.deleted_at IS NULL
      AND d::date BETWEEN b.starts_on AND b.ends_on
  )
  ON CONFLICT (scheduled_at) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO club_events (
    title,event_type,starts_at,ends_at,location,source,external_id,description
  )
  SELECT
    COALESCE(r.title,'Sondertraining'),
    'training',
    s.scheduled_at,
    NULL,
    r.location,
    'training_schedule',
    'training-session:' || s.id::text,
    CASE
      WHEN s.source='special' THEN COALESCE(s.notes,'Sondertraining · Ende offen')
      ELSE 'Regeltraining · Beginn 19:00 Uhr · Ende offen'
    END
  FROM training_sessions s
  LEFT JOIN training_schedule_rules r
    ON EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')::int = r.weekday
  WHERE s.event_id IS NULL
    AND s.deleted_at IS NULL
    AND s.source IN ('schedule','special')
  ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
  DO UPDATE SET
    title=EXCLUDED.title,
    starts_at=EXCLUDED.starts_at,
    ends_at=NULL,
    location=EXCLUDED.location,
    description=EXCLUDED.description,
    deleted_at=NULL,
    deleted_by=NULL,
    delete_reason=NULL,
    updated_at=now();

  UPDATE training_sessions s
  SET event_id=e.id
  FROM club_events e
  WHERE s.event_id IS NULL
    AND s.deleted_at IS NULL
    AND e.deleted_at IS NULL
    AND e.source='training_schedule'
    AND e.external_id='training-session:' || s.id::text;

  RETURN inserted_count;
END
$function$;
