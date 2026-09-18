-- VDC Club · External team identity must be unique

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_external_unique
  ON teams(external_source,external_id)
  WHERE external_id IS NOT NULL;
