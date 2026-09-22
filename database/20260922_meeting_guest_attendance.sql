-- VDC Club · Gaststatus in der Sitzungsvorbereitung

ALTER TABLE meeting_guests DROP CONSTRAINT IF EXISTS meeting_guests_attendance_check;

ALTER TABLE meeting_guests
  ADD CONSTRAINT meeting_guests_attendance_check
  CHECK (attendance IN ('invited','present','absent'));

ALTER TABLE meeting_guests ALTER COLUMN attendance SET DEFAULT 'invited';

UPDATE meeting_guests g
 SET attendance='invited'
 FROM meetings m
 WHERE m.id=g.meeting_id
   AND m.status='planned'
   AND g.attendance='present';
