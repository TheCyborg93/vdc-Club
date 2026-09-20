-- VDC Club · Anonymous or identified surveys

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS survey_identity_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','email','tel','number')),
  required boolean NOT NULL DEFAULT true,
  UNIQUE (survey_id, position)
);

CREATE TABLE IF NOT EXISTS survey_response_identity_values (
  response_id uuid NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES survey_identity_fields(id) ON DELETE CASCADE,
  value text NOT NULL,
  PRIMARY KEY (response_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_identity_fields_survey
  ON survey_identity_fields(survey_id,position);

CREATE INDEX IF NOT EXISTS idx_survey_identity_values_response
  ON survey_response_identity_values(response_id);
