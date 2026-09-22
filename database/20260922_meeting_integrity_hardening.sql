-- VDC Club · Datenbank-Härtung Vorstandssitzungen

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_votes_nonnegative_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_votes_nonnegative_check
      CHECK (votes_yes >= 0 AND votes_no >= 0 AND votes_abstain >= 0 AND excluded_voters >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_eligible_nonnegative_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_eligible_nonnegative_check
      CHECK (eligible_voters IS NULL OR eligible_voters >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_vote_total_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_vote_total_check
      CHECK (
        eligible_voters IS NULL
        OR eligible_voters = votes_yes + votes_no + votes_abstain
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_decision_requires_vote_data_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_decision_requires_vote_data_check
      CHECK (
        decision_outcome IS NULL
        OR (vote_method IS NOT NULL AND eligible_voters IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_roll_call_details_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_roll_call_details_check
      CHECK (
        vote_method IS DISTINCT FROM 'roll_call'
        OR decision_outcome IS NULL
        OR NULLIF(trim(vote_details),'') IS NOT NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_status_starts
  ON meetings(status,starts_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_minutes_status
  ON meetings(minutes_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_resolutions_outcome
  ON resolutions(decision_outcome) WHERE decision_outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_meeting_agenda
  ON documents(meeting_id,agenda_item_id)
  WHERE deleted_at IS NULL AND agenda_item_id IS NOT NULL;
