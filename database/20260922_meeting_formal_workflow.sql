-- VDC Club · Formale Vorstandssitzung / Schriftführer-Workflow

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_mode text NOT NULL DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_method text,
  ADD COLUMN IF NOT EXISTS invitation_timely boolean,
  ADD COLUMN IF NOT EXISTS agenda_sent_with_invitation boolean,
  ADD COLUMN IF NOT EXISTS quorum_confirmed boolean,
  ADD COLUMN IF NOT EXISTS quorum_note text,
  ADD COLUMN IF NOT EXISTS quorum_basis text,
  ADD COLUMN IF NOT EXISTS formalities_note text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_meeting_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meetings_mode_check') THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_mode_check
      CHECK (meeting_mode IN ('in_person','hybrid','online'));
  END IF;
END $$;

ALTER TABLE meeting_attendees
  ADD COLUMN IF NOT EXISTS voting_eligible boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS meeting_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name text NOT NULL,
  organization text,
  note text,
  attendance text NOT NULL DEFAULT 'present',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meeting_guests_attendance_check') THEN
    ALTER TABLE meeting_guests
      ADD CONSTRAINT meeting_guests_attendance_check
      CHECK (attendance IN ('present','absent'));
  END IF;
END $$;

ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS announced_with_invitation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS decision_basis_note text,
  ADD COLUMN IF NOT EXISTS carried_from_agenda_item_id uuid REFERENCES agenda_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carried_from_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS vote_method text,
  ADD COLUMN IF NOT EXISTS eligible_voters integer,
  ADD COLUMN IF NOT EXISTS excluded_voters integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_outcome text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_vote_method_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_vote_method_check
      CHECK (vote_method IS NULL OR vote_method IN ('open','show_of_hands','roll_call','secret','electronic'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resolutions_decision_outcome_check') THEN
    ALTER TABLE resolutions
      ADD CONSTRAINT resolutions_decision_outcome_check
      CHECK (decision_outcome IS NULL OR decision_outcome IN ('accepted','rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agenda_vote_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  person_name text,
  reason text NOT NULL,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_vote_exclusions_person_check
    CHECK (member_id IS NOT NULL OR NULLIF(trim(person_name),'') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_vote_exclusions_member
  ON agenda_vote_exclusions(agenda_item_id,member_id)
  WHERE member_id IS NOT NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS agenda_item_id uuid REFERENCES agenda_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_guests_meeting ON meeting_guests(meeting_id);

CREATE INDEX IF NOT EXISTS idx_documents_agenda_item ON documents(agenda_item_id);

CREATE INDEX IF NOT EXISTS idx_agenda_items_carryover_agenda ON agenda_items(carried_from_agenda_item_id);

CREATE INDEX IF NOT EXISTS idx_agenda_items_carryover_task ON agenda_items(carried_from_task_id);
