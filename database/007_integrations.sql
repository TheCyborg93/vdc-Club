-- VDC Club · Integration entity mapping and sync history

CREATE TABLE IF NOT EXISTS integration_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL REFERENCES integration_connections(integration_key) ON DELETE CASCADE,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  local_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_key, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS integration_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL REFERENCES integration_connections(integration_key) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL CHECK (status IN ('success','partial','error')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_connections ADD COLUMN IF NOT EXISTS token_hash text;

CREATE INDEX IF NOT EXISTS idx_integration_links_local
  ON integration_entity_links(entity_type,local_id);

CREATE INDEX IF NOT EXISTS idx_sync_runs_key_finished
  ON integration_sync_runs(integration_key,finished_at DESC);
