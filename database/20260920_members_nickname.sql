-- VDC Club · Optionaler Spitzname für Mitglieder

ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname text;
