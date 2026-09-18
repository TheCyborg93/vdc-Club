-- VDC Club · document version history

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS current_version_number integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  storage_type text NOT NULL,
  storage_ref text,
  mime_type text,
  original_filename text,
  file_size_bytes bigint,
  checksum_sha256 text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_at timestamptz NOT NULL DEFAULT now(),
  change_note text,
  CONSTRAINT document_versions_number_positive CHECK (version_number > 0),
  CONSTRAINT document_versions_document_version_unique UNIQUE (document_id,version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document
  ON document_versions(document_id,version_number DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_created_by
  ON document_versions(created_by);
