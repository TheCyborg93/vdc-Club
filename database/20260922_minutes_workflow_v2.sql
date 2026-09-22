-- VDC Club · Protokollworkflow v2

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_minutes_status_check;

ALTER TABLE meetings
  ADD CONSTRAINT meetings_minutes_status_check
  CHECK (minutes_status IN ('draft','review','archived'));
