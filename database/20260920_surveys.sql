-- VDC Club · Anonymous surveys
-- Public responses intentionally store no member/user/email/IP reference.

CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL UNIQUE,
  title text NOT NULL,
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_group text NOT NULL DEFAULT 'Alle',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  results_visibility text NOT NULL DEFAULT 'internal' CHECK (results_visibility IN ('internal','after_submit')),
  thank_you_text text NOT NULL DEFAULT 'Vielen Dank für deine Teilnahme.',
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  position integer NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single','multiple','text')),
  required boolean NOT NULL DEFAULT true,
  max_selections integer CHECK (max_selections IS NULL OR max_selections > 0),
  help_text text,
  UNIQUE (survey_id, position)
);

CREATE TABLE IF NOT EXISTS survey_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  UNIQUE (question_id, position)
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  text_value text,
  UNIQUE (response_id, question_id)
);

CREATE TABLE IF NOT EXISTS survey_answer_options (
  answer_id uuid NOT NULL REFERENCES survey_answers(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES survey_options(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_surveys_status_dates ON surveys(status,ends_at);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id,position);
CREATE INDEX IF NOT EXISTS idx_survey_options_question ON survey_options(question_id,position);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id,submitted_at);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response ON survey_answers(response_id);

DROP TRIGGER IF EXISTS trg_surveys_updated_at ON surveys;
CREATE TRIGGER trg_surveys_updated_at
BEFORE UPDATE ON surveys
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
