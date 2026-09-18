-- VDC Club · Initial schema
-- Applied to Neon project: vdc-club
-- Region: eu-central-1

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_number text UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  birth_date date,
  join_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','passive','inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid UNIQUE REFERENCES members(id) ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','invited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT ''
);

INSERT INTO roles (key,name,description) VALUES
 ('admin','Administrator','Vollzugriff auf VDC Club'),
 ('board','Vorstand','Allgemeiner Vorstands-Zugriff'),
 ('chair','1. Vorsitz','Vorsitz und Sitzungsleitung'),
 ('vice_chair','2. Vorsitz','Stellvertretender Vorsitz'),
 ('treasurer','Kassierer','Finanzen und Beiträge'),
 ('secretary','Schriftführer','Sitzungen, Protokolle und Beschlüsse'),
 ('sport_director','Sportwart','Mannschaften und Sportbetrieb'),
 ('team_captain','Team Captain','Mannschaftsbezogene Funktionen'),
 ('tournament_director','Turnierleitung','Interne Turniere')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_key)
);

CREATE TABLE IF NOT EXISTS board_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title text NOT NULL,
  role_key text REFERENCES roles(key) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  league text,
  season text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  external_source text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  is_captain boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (team_id, member_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_date date,
  owner_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  source_type text,
  source_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  attendance text NOT NULL DEFAULT 'invited' CHECK (attendance IN ('invited','present','absent','excused')),
  PRIMARY KEY (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  description text,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','done','deferred')),
  UNIQUE (meeting_id, position)
);

CREATE TABLE IF NOT EXISTS resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  agenda_item_id uuid REFERENCES agenda_items(id) ON DELETE SET NULL,
  title text NOT NULL,
  decision_text text NOT NULL,
  votes_yes integer NOT NULL DEFAULT 0,
  votes_no integer NOT NULL DEFAULT 0,
  votes_abstain integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','implemented','withdrawn')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'club',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  source text NOT NULL DEFAULT 'club',
  external_id text,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('income','expense')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  category text NOT NULL,
  description text NOT NULL,
  booked_on date NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('planned','booked','cancelled')),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  storage_type text NOT NULL DEFAULT 'link',
  storage_ref text,
  mime_type text,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  resolution_id uuid REFERENCES resolutions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  contract_start date,
  contract_end date,
  contribution_text text,
  club_benefits text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('lead','active','expired','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','error','disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO integration_connections (integration_key,display_name) VALUES
 ('vdc_tc','VDC-TC'), ('vdc_turnier','VDC-Turnier'), ('vdc_training','VDC-Training')
ON CONFLICT (integration_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS club_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status,due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_starts ON club_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_finance_date ON finance_entries(booked_on);
CREATE INDEX IF NOT EXISTS idx_resolutions_status ON resolutions(status);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_users_updated_at ON app_users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_events_updated_at ON club_events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON club_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_sponsors_updated_at ON sponsors;
CREATE TRIGGER trg_sponsors_updated_at BEFORE UPDATE ON sponsors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
