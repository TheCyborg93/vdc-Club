-- VDC Club · Uploaded document metadata

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON documents(uploaded_by);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_upload_storage_ref_unique
  ON documents(storage_ref)
  WHERE storage_type='upload' AND storage_ref IS NOT NULL;
