-- VDC Club · Club profile and membership lifecycle

CREATE TABLE IF NOT EXISTS club_profile (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  club_name text NOT NULL DEFAULT 'Vestischer Dart Club e.V.',
  short_name text NOT NULL DEFAULT 'VDC',
  legal_form text DEFAULT 'e.V.',
  street text,
  postal_code text,
  city text DEFAULT 'Marl',
  email text,
  phone text,
  website text,
  founded_on date,
  fiscal_year_start_month integer NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  default_annual_fee numeric(12,2) CHECK (default_annual_fee >= 0),
  fee_due_month integer CHECK (fee_due_month BETWEEN 1 AND 12),
  fee_due_day integer CHECK (fee_due_day BETWEEN 1 AND 31),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO club_profile (id,club_name,short_name,legal_form,city)
VALUES (1,'Vestischer Dart Club e.V.','VDC','e.V.','Marl')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE members ADD COLUMN IF NOT EXISTS leave_date date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS notice_date date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_type text DEFAULT 'regular';
ALTER TABLE members ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS member_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  reason text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  changed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_status_history_member
  ON member_status_history(member_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_leave_date ON members(leave_date);
CREATE INDEX IF NOT EXISTS idx_members_notice_date ON members(notice_date);

DROP TRIGGER IF EXISTS trg_club_profile_updated_at ON club_profile;
CREATE TRIGGER trg_club_profile_updated_at
  BEFORE UPDATE ON club_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
