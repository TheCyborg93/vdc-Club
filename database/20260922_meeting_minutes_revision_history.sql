-- Mehrere Workflow-Ereignisse pro Protokollversion aufbewahren
ALTER TABLE meeting_minutes_revisions
  DROP CONSTRAINT IF EXISTS meeting_minutes_revisions_meeting_id_version_key;
