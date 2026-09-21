-- VDC Club · Kein Regeltraining an Heimspieltagen

CREATE OR REPLACE FUNCTION public.has_vdc_home_game(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM club_events e
    LEFT JOIN teams t ON t.id=e.team_id
    WHERE e.deleted_at IS NULL
      AND e.source='vdc_tc'
      AND e.event_type='league'
      AND (e.starts_at AT TIME ZONE 'Europe/Berlin')::date=p_date
      AND (
        e.description ILIKE 'Heimspiel%'
        OR (
          t.id IS NOT NULL
          AND lower(trim(split_part(e.title,' – ',1)))=lower(trim(t.name))
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.ensure_training_schedule(p_until date DEFAULT (CURRENT_DATE + 365))
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  -- Restore a previously suppressed regular training if the home match moved/vanished.
  UPDATE club_events e
  SET
    title='Vereinstraining',
    description='Regeltraining · Beginn 19:00 Uhr · Ende offen',
    deleted_at=NULL,
    deleted_by=NULL,
    delete_reason=NULL,
    updated_at=now()
  FROM training_sessions s
  WHERE s.event_id=e.id
    AND s.source='schedule'
    AND s.notes LIKE 'homegame:%'
    AND s.scheduled_at>=now()
    AND NOT public.has_vdc_home_game((s.scheduled_at AT TIME ZONE 'Europe/Berlin')::date);

  UPDATE training_sessions s
  SET
    status='planned',
    notes=NULL,
    updated_at=now()
  WHERE s.source='schedule'
    AND s.deleted_at IS NULL
    AND s.notes LIKE 'homegame:%'
    AND s.scheduled_at>=now()
    AND NOT public.has_vdc_home_game((s.scheduled_at AT TIME ZONE 'Europe/Berlin')::date);

  -- Existing regular training is suppressed whenever a home league match is on that date.
  UPDATE training_sessions s
  SET
    status='cancelled',
    notes='homegame:automatic|Regeltraining entfällt wegen Heimspiel',
    attendance_recorded_at=NULL,
    completed_at=NULL,
    updated_at=now()
  WHERE s.source='schedule'
    AND s.deleted_at IS NULL
    AND s.scheduled_at>=now()
    AND s.status='planned'
    AND public.has_vdc_home_game((s.scheduled_at AT TIME ZONE 'Europe/Berlin')::date);

  UPDATE club_events e
  SET
    deleted_at=COALESCE(e.deleted_at,now()),
    delete_reason='Automatisch ausgeblendet: Heimspiel am Trainingstag.',
    updated_at=now()
  FROM training_sessions s
  WHERE s.event_id=e.id
    AND s.source='schedule'
    AND s.deleted_at IS NULL
    AND s.notes LIKE 'homegame:%'
    AND s.scheduled_at>=now();

  -- Generate regular Tue/Fri sessions only when there is neither a blackout nor a home match.
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
    AND NOT public.has_vdc_home_game(d::date)
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
    AND s.status<>'cancelled'
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
    AND s.status<>'cancelled'
    AND e.deleted_at IS NULL
    AND e.source='training_schedule'
    AND e.external_id='training-session:' || s.id::text;

  RETURN inserted_count;
END
$function$;
