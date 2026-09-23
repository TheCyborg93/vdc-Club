-- VDC Club · Gegner und Gegnerkader aus VDC-TC

CREATE TABLE IF NOT EXISTS tc_opponent_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source text NOT NULL DEFAULT 'vdc_tc',
  external_id text NOT NULL,
  name text NOT NULL,
  league text,
  season text,
  venue text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id)
);

CREATE TABLE IF NOT EXISTS tc_opponent_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opponent_team_id uuid NOT NULL REFERENCES tc_opponent_teams(id) ON DELETE CASCADE,
  external_source text NOT NULL DEFAULT 'vdc_tc',
  external_id text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  current_stats jsonb,
  historical_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id),
  UNIQUE (opponent_team_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tc_opponent_teams_name
  ON tc_opponent_teams(lower(name));

CREATE INDEX IF NOT EXISTS idx_tc_opponent_players_team_active
  ON tc_opponent_players(opponent_team_id, is_active, name);

DROP TRIGGER IF EXISTS trg_tc_opponent_teams_updated_at ON tc_opponent_teams;
CREATE TRIGGER trg_tc_opponent_teams_updated_at
  BEFORE UPDATE ON tc_opponent_teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tc_opponent_players_updated_at ON tc_opponent_players;
CREATE TRIGGER trg_tc_opponent_players_updated_at
  BEFORE UPDATE ON tc_opponent_players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
