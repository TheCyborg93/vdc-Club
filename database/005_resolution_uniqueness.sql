-- VDC Club · One resolution per agenda item

CREATE UNIQUE INDEX IF NOT EXISTS idx_resolutions_agenda_unique
  ON resolutions(agenda_item_id)
  WHERE agenda_item_id IS NOT NULL;
