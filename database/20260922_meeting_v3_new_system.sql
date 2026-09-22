-- VDC Club · Neues Sitzungssystem V3
-- Parallel zum bisherigen Sitzungsmodul. Keine bestehenden Sitzungstabellen werden verändert.

CREATE TABLE IF NOT EXISTS meeting_v3_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  meeting_type text NOT NULL DEFAULT 'board',
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_templates_type_check
    CHECK (meeting_type IN ('board','general_assembly','extraordinary','custom'))
);

CREATE TABLE IF NOT EXISTS meeting_v3_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES meeting_v3_templates(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  agenda_type text NOT NULL DEFAULT 'consultation',
  description text,
  estimated_minutes integer,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_template_items_type_check
    CHECK (agenda_type IN ('information','consultation','decision')),
  CONSTRAINT meeting_v3_template_items_minutes_check
    CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  UNIQUE (template_id,position)
);

CREATE TABLE IF NOT EXISTS meeting_v3_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  meeting_type text NOT NULL DEFAULT 'board',
  custom_type_label text,
  lifecycle_state text NOT NULL DEFAULT 'preparation',
  meeting_mode text NOT NULL DEFAULT 'in_person',
  starts_at timestamptz NOT NULL,
  location text,
  description text,

  chair_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  minute_taker_member_id uuid REFERENCES members(id) ON DELETE SET NULL,

  invited_at timestamptz,
  invitation_method text,
  invitation_timely boolean,
  agenda_sent_with_invitation boolean,

  quorum_confirmed boolean,
  quorum_basis text,
  quorum_note text,

  opened_at timestamptz,
  ended_at timestamptz,
  next_meeting_at timestamptz,

  minutes_status text NOT NULL DEFAULT 'not_started',
  current_minutes_revision integer NOT NULL DEFAULT 0,
  archived_at timestamptz,

  template_id uuid REFERENCES meeting_v3_templates(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_v3_meetings_type_check
    CHECK (meeting_type IN ('board','general_assembly','extraordinary','custom')),
  CONSTRAINT meeting_v3_meetings_custom_type_check
    CHECK (meeting_type <> 'custom' OR NULLIF(trim(custom_type_label),'') IS NOT NULL),
  CONSTRAINT meeting_v3_meetings_lifecycle_check
    CHECK (lifecycle_state IN (
      'preparation','ready','live','closing',
      'minutes_draft','minutes_review','archived','cancelled'
    )),
  CONSTRAINT meeting_v3_meetings_mode_check
    CHECK (meeting_mode IN ('in_person','hybrid','online')),
  CONSTRAINT meeting_v3_meetings_minutes_check
    CHECK (minutes_status IN ('not_started','draft','review','archived'))
);

CREATE TABLE IF NOT EXISTS meeting_v3_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  attendance text NOT NULL DEFAULT 'invited',
  voting_eligible boolean NOT NULL DEFAULT true,
  role_in_meeting text NOT NULL DEFAULT 'participant',
  joined_at timestamptz,
  left_at timestamptz,
  note text,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_participants_attendance_check
    CHECK (attendance IN ('invited','present','absent','excused','late','left_early')),
  CONSTRAINT meeting_v3_participants_role_check
    CHECK (role_in_meeting IN ('participant','chair','minute_taker')),
  UNIQUE (meeting_id,member_id)
);

CREATE TABLE IF NOT EXISTS meeting_v3_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  name text NOT NULL,
  organization text,
  attendance text NOT NULL DEFAULT 'present',
  joined_at timestamptz,
  left_at timestamptz,
  note text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_guests_attendance_check
    CHECK (attendance IN ('present','absent','late','left_early'))
);

CREATE TABLE IF NOT EXISTS meeting_v3_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  agenda_type text NOT NULL DEFAULT 'consultation',
  description text,
  estimated_minutes integer,
  responsible_member_id uuid REFERENCES members(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'open',
  result_code text,
  spontaneous boolean NOT NULL DEFAULT false,
  spontaneous_reason text,
  announced_with_invitation boolean NOT NULL DEFAULT true,

  carried_from_agenda_item_id uuid REFERENCES meeting_v3_agenda_items(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,

  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_v3_agenda_items_type_check
    CHECK (agenda_type IN ('information','consultation','decision')),
  CONSTRAINT meeting_v3_agenda_items_status_check
    CHECK (status IN ('open','active','completed','deferred','skipped')),
  CONSTRAINT meeting_v3_agenda_items_result_check
    CHECK (
      result_code IS NULL OR
      result_code IN ('noted','completed','deferred','resolution','no_decision')
    ),
  CONSTRAINT meeting_v3_agenda_items_spontaneous_check
    CHECK (spontaneous=false OR NULLIF(trim(spontaneous_reason),'') IS NOT NULL),
  CONSTRAINT meeting_v3_agenda_items_minutes_check
    CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  UNIQUE (meeting_id,position)
);

CREATE TABLE IF NOT EXISTS meeting_v3_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES meeting_v3_agenda_items(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  version integer NOT NULL,
  revision_kind text NOT NULL DEFAULT 'autosave',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_note_versions_kind_check
    CHECK (revision_kind IN ('autosave','checkpoint','final')),
  UNIQUE (meeting_id,agenda_item_id,version)
);

CREATE TABLE IF NOT EXISTS meeting_v3_vote_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES meeting_v3_agenda_items(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  person_name text,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_vote_exclusions_person_check
    CHECK (member_id IS NOT NULL OR NULLIF(trim(person_name),'') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_v3_vote_exclusions_member_active
  ON meeting_v3_vote_exclusions(agenda_item_id,member_id)
  WHERE member_id IS NOT NULL AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS meeting_v3_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid NOT NULL REFERENCES meeting_v3_agenda_items(id) ON DELETE RESTRICT,
  resolution_number text,
  title text NOT NULL,
  decision_text text NOT NULL,

  vote_method text NOT NULL DEFAULT 'show_of_hands',
  eligible_voters integer NOT NULL,
  excluded_voters integer NOT NULL DEFAULT 0,
  votes_yes integer NOT NULL DEFAULT 0,
  votes_no integer NOT NULL DEFAULT 0,
  votes_abstain integer NOT NULL DEFAULT 0,
  decision_outcome text NOT NULL,

  implementation_status text NOT NULL DEFAULT 'open',
  implementation_notes text,
  implemented_at timestamptz,

  decided_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_v3_resolutions_vote_method_check
    CHECK (vote_method IN ('open','show_of_hands','roll_call','secret')),
  CONSTRAINT meeting_v3_resolutions_outcome_check
    CHECK (decision_outcome IN ('accepted','rejected')),
  CONSTRAINT meeting_v3_resolutions_implementation_check
    CHECK (implementation_status IN ('open','in_progress','implemented','withdrawn')),
  CONSTRAINT meeting_v3_resolutions_vote_numbers_check
    CHECK (
      eligible_voters >= 0 AND excluded_voters >= 0 AND
      votes_yes >= 0 AND votes_no >= 0 AND votes_abstain >= 0 AND
      votes_yes + votes_no + votes_abstain = eligible_voters
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_v3_resolution_number
  ON meeting_v3_resolutions(resolution_number)
  WHERE resolution_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS meeting_v3_named_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id uuid NOT NULL REFERENCES meeting_v3_resolutions(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  person_name text,
  vote text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_named_votes_person_check
    CHECK (member_id IS NOT NULL OR NULLIF(trim(person_name),'') IS NOT NULL),
  CONSTRAINT meeting_v3_named_votes_vote_check
    CHECK (vote IN ('yes','no','abstain')),
  UNIQUE (resolution_id,member_id)
);

CREATE TABLE IF NOT EXISTS meeting_v3_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES meeting_v3_agenda_items(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  title text NOT NULL,
  attachment_kind text NOT NULL DEFAULT 'general',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_attachments_kind_check
    CHECK (attachment_kind IN ('invitation','agenda','general','agenda_item','minutes'))
);

CREATE TABLE IF NOT EXISTS meeting_v3_minutes_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  snapshot jsonb NOT NULL,
  change_reason text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_v3_minutes_revisions_status_check
    CHECK (status IN ('draft','review','archived')),
  UNIQUE (meeting_id,revision)
);

CREATE TABLE IF NOT EXISTS meeting_v3_audit_log (
  id bigserial PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES meeting_v3_meetings(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_meetings_state_start
  ON meeting_v3_meetings(lifecycle_state,starts_at);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_participants_meeting
  ON meeting_v3_participants(meeting_id,attendance);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_agenda_meeting_position
  ON meeting_v3_agenda_items(meeting_id,position);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_notes_agenda_created
  ON meeting_v3_note_versions(agenda_item_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_resolutions_meeting
  ON meeting_v3_resolutions(meeting_id,decided_at);

CREATE INDEX IF NOT EXISTS idx_meeting_v3_audit_meeting
  ON meeting_v3_audit_log(meeting_id,created_at DESC);

DROP TRIGGER IF EXISTS trg_meeting_v3_templates_updated_at ON meeting_v3_templates;
CREATE TRIGGER trg_meeting_v3_templates_updated_at
  BEFORE UPDATE ON meeting_v3_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_v3_meetings_updated_at ON meeting_v3_meetings;
CREATE TRIGGER trg_meeting_v3_meetings_updated_at
  BEFORE UPDATE ON meeting_v3_meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_v3_agenda_updated_at ON meeting_v3_agenda_items;
CREATE TRIGGER trg_meeting_v3_agenda_updated_at
  BEFORE UPDATE ON meeting_v3_agenda_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Standard-Vorlage für Vorstandssitzungen.
INSERT INTO meeting_v3_templates (name,meeting_type,description,is_default)
SELECT
  'Vorstand – Standard',
  'board',
  'Standard-Tagesordnung für reguläre Vorstandssitzungen.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM meeting_v3_templates
  WHERE meeting_type='board' AND is_default=true
);

INSERT INTO meeting_v3_template_items (template_id,position,title,agenda_type,description,is_required)
SELECT t.id,v.position,v.title,v.agenda_type,v.description,v.is_required
FROM meeting_v3_templates t
CROSS JOIN (
  VALUES
    (1,'Begrüßung & Beschlussfähigkeit','information','Eröffnung, Anwesenheit und formaler Sitzungsbeginn.',true),
    (2,'Protokoll der letzten Sitzung','decision','Freigabe bzw. Korrektur des letzten Protokolls.',true),
    (3,'Berichte & laufende Themen','information','Kurze Berichte aus den Verantwortungsbereichen.',false),
    (4,'Offene Beschlüsse & Aufgaben','consultation','Status offener Beschlüsse und Folgeaufgaben.',false),
    (5,'Sonstiges','consultation','Weitere angekündigte Themen.',false)
) AS v(position,title,agenda_type,description,is_required)
WHERE t.meeting_type='board' AND t.is_default=true
  AND NOT EXISTS (
    SELECT 1 FROM meeting_v3_template_items i WHERE i.template_id=t.id
  );
