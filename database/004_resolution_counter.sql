-- VDC Club · Resolution numbering

CREATE TABLE IF NOT EXISTS resolution_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_member
  ON meeting_attendees(member_id);
