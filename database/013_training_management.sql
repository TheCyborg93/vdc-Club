-- VDC Club · Training pauses and rolling schedule exclusions

CREATE TABLE IF NOT EXISTS training_blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_training_blackouts_range
  ON training_blackouts(starts_on,ends_on);

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
  WHERE NOT EXISTS (
    SELECT 1
    FROM training_blackouts b
    WHERE d::date BETWEEN b.starts_on AND b.ends_on
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
    AND s.source IN ('schedule','special')
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
