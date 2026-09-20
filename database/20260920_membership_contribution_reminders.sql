-- VDC Club · Erinnerungs- und Mahnstatus für Mitgliedsbeiträge

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS reminder_level text NOT NULL DEFAULT 'none'
  CHECK (reminder_level IN ('none','reminder1','reminder2','dunning'));

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS last_reminder_on date;
