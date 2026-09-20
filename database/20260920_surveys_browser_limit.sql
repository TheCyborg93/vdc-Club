-- VDC Club · Optional anonymous duplicate protection
-- Uses only a browser cookie after submission; no personal identifier is stored in the database.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS one_response_per_browser boolean NOT NULL DEFAULT false;
