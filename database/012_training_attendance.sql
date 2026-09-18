-- VDC Club · Recurring training and attendance

CREATE TABLE IF NOT EXISTS training_schedule_rules (
  id smallserial PRIMARY KEY,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  title text NOT NULL DEFAULT 'Vereinstraining',
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weekday)
);

INSERT INTO training_schedule_rules (weekday,start_time,title,is_active)
VALUES
  (2,'19:00','Vereinstraining',true),
  (5,'19:00','Vereinstraining',true)
ON CONFLICT (weekday)
DO UPDATE SET
  start_time=EXCLUDED.start_time,
  title=EXCLUDED.title,
  is_active=true;

CREATE TABLE IF NOT EXISTS training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid UNIQUE REFERENCES club_events(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','completed','cancelled')),
  source text NOT NULL DEFAULT 'schedule',
  external_id text,
  notes text,
  attendance_recorded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_sessions_source_external
  ON training_sessions(source,external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_sessions_scheduled
  ON training_sessions(scheduled_at);

CREATE TABLE IF NOT EXISTS training_attendance (
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  attendance text NOT NULL DEFAULT 'absent'
    CHECK (attendance IN ('present','absent','excused')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,member_id)
);

CREATE INDEX IF NOT EXISTS idx_training_attendance_member
  ON training_attendance(member_id,session_id);

DROP TRIGGER IF EXISTS trg_training_rules_updated_at ON training_schedule_rules;
CREATE TRIGGER trg_training_rules_updated_at
  BEFORE UPDATE ON training_schedule_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_training_sessions_updated_at ON training_sessions;
CREATE TRIGGER trg_training_sessions_updated_at
  BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION ensure_training_schedule(
  p_until date DEFAULT (CURRENT_DATE + 365)
)
RETURNS integer
LANGUAGE plpgsql
AS $$
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
  ON CONFLICT (scheduled_at) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO club_events (
    title,event_type,starts_at,ends_at,location,source,external_id,description
  )
  SELECT
    r.title,
    'training',
    s.scheduled_at,
    NULL,
    r.location,
    'training_schedule',
    'training-session:' || s.id::text,
    'Regeltraining · Beginn 19:00 Uhr · Ende offen'
  FROM training_sessions s
  JOIN training_schedule_rules r
    ON EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')::int = r.weekday
  WHERE s.event_id IS NULL
    AND s.source='schedule'
  ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
  DO UPDATE SET
    title=EXCLUDED.title,
    starts_at=EXCLUDED.starts_at,
    ends_at=NULL,
    location=EXCLUDED.location,
    description=EXCLUDED.description,
    updated_at=now();

  UPDATE training_sessions s
  SET event_id=e.id
  FROM club_events e
  WHERE s.event_id IS NULL
    AND e.source='training_schedule'
    AND e.external_id='training-session:' || s.id::text;

  RETURN inserted_count;
END
$$;

SELECT ensure_training_schedule(CURRENT_DATE + 365);

INSERT INTO training_sessions (
  event_id,scheduled_at,status,source,external_id,notes
)
SELECT
  e.id,
  e.starts_at,
  CASE WHEN e.starts_at < now() THEN 'completed' ELSE 'planned' END,
  'vdc_training',
  e.external_id,
  e.description
FROM club_events e
WHERE e.source='vdc_training'
  AND e.event_type='training'
ON CONFLICT (scheduled_at)
DO UPDATE SET
  event_id=COALESCE(training_sessions.event_id,EXCLUDED.event_id),
  source=CASE
    WHEN training_sessions.source='schedule' THEN EXCLUDED.source
    ELSE training_sessions.source
  END,
  external_id=COALESCE(training_sessions.external_id,EXCLUDED.external_id),
  notes=COALESCE(training_sessions.notes,EXCLUDED.notes);
