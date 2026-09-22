-- Backfill missing protocol documents for completed meetings.
-- Keeps the document register aligned with the meeting minutes workflow.

INSERT INTO documents (
  title,
  category,
  storage_type,
  storage_ref,
  status,
  document_date,
  meeting_id,
  notes,
  archived_at,
  archived_by
)
SELECT
  'Protokoll · ' || m.title,
  'Protokoll',
  'internal',
  '/sitzungen/' || m.id::text || '/protokoll',
  CASE m.minutes_status
    WHEN 'draft' THEN 'draft'
    WHEN 'review' THEN 'review'
    WHEN 'archived' THEN 'archived'
    ELSE 'draft'
  END,
  (m.starts_at AT TIME ZONE 'Europe/Berlin')::date,
  m.id,
  CASE m.minutes_status
    WHEN 'draft' THEN 'Nachträglich registrierter Protokollentwurf.'
    WHEN 'review' THEN 'Nachträglich registriertes Protokoll in Prüfung.'
    WHEN 'archived' THEN 'Nachträglich registriertes freigegebenes Sitzungsprotokoll.'
    ELSE 'Nachträglich registriertes Sitzungsprotokoll.'
  END,
  CASE WHEN m.minutes_status='archived'
    THEN COALESCE(m.minutes_archived_at,m.minutes_approved_at,m.ended_at,now())
    ELSE NULL
  END,
  CASE WHEN m.minutes_status='archived'
    THEN COALESCE(m.minutes_archived_by,m.minutes_approved_by)
    ELSE NULL
  END
FROM meetings m
WHERE m.deleted_at IS NULL
  AND m.status='completed'
  AND m.minutes_status IN ('draft','review','archived')
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.meeting_id=m.id
      AND d.category='Protokoll'
      AND d.deleted_at IS NULL
  );
