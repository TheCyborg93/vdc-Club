-- VDC Club · Erweiterte Mitgliedsbeiträge

CREATE TABLE IF NOT EXISTS membership_fee_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  annual_amount numeric(12,2) NOT NULL CHECK (annual_amount >= 0),
  payment_frequency text NOT NULL DEFAULT 'annual'
    CHECK (payment_frequency IN ('annual','semiannual','quarterly','monthly')),
  first_due_month integer NOT NULL DEFAULT 1 CHECK (first_due_month BETWEEN 1 AND 12),
  due_day integer NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_fee_profiles (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  fee_type_id uuid REFERENCES membership_fee_types(id) ON DELETE SET NULL,
  custom_annual_amount numeric(12,2) CHECK (custom_annual_amount IS NULL OR custom_annual_amount >= 0),
  custom_payment_frequency text
    CHECK (custom_payment_frequency IS NULL OR custom_payment_frequency IN ('annual','semiannual','quarterly','monthly')),
  reference_text text,
  valid_from date,
  valid_until date,
  exempt_from date,
  exempt_until date,
  exemption_reason text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS fee_type_id uuid REFERENCES membership_fee_types(id) ON DELETE SET NULL;

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS fee_type_name text;

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS payment_frequency text
  CHECK (payment_frequency IS NULL OR payment_frequency IN ('annual','semiannual','quarterly','monthly'));

ALTER TABLE membership_fees ADD COLUMN IF NOT EXISTS reference_text text;

CREATE TABLE IF NOT EXISTS membership_fee_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id uuid NOT NULL REFERENCES membership_fees(id) ON DELETE CASCADE,
  installment_no integer NOT NULL CHECK (installment_no > 0),
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fee_id, installment_no)
);

CREATE TABLE IF NOT EXISTS membership_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id uuid NOT NULL REFERENCES membership_fees(id) ON DELETE CASCADE,
  finance_entry_id uuid REFERENCES finance_entries(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_fee_profiles_type ON member_fee_profiles(fee_type_id);

CREATE INDEX IF NOT EXISTS idx_membership_fee_installments_fee_due ON membership_fee_installments(fee_id,due_date);

CREATE INDEX IF NOT EXISTS idx_membership_fee_payments_fee_paid ON membership_fee_payments(fee_id,paid_on);

DROP TRIGGER IF EXISTS trg_membership_fee_types_updated_at ON membership_fee_types;

CREATE TRIGGER trg_membership_fee_types_updated_at BEFORE UPDATE ON membership_fee_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_member_fee_profiles_updated_at ON member_fee_profiles;

CREATE TRIGGER trg_member_fee_profiles_updated_at BEFORE UPDATE ON member_fee_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
