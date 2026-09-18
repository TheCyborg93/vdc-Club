-- VDC Club · Finance and document extensions

CREATE TABLE IF NOT EXISTS finance_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, category)
);

CREATE TABLE IF NOT EXISTS membership_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','exempt','cancelled')),
  paid_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, fiscal_year)
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS finance_entry_id uuid REFERENCES finance_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_membership_fees_year_status ON membership_fees(fiscal_year,status);
CREATE INDEX IF NOT EXISTS idx_membership_fees_member ON membership_fees(member_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_year ON finance_budgets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_documents_category_status ON documents(category,status);

DROP TRIGGER IF EXISTS trg_finance_budgets_updated_at ON finance_budgets;
CREATE TRIGGER trg_finance_budgets_updated_at BEFORE UPDATE ON finance_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_membership_fees_updated_at ON membership_fees;
CREATE TRIGGER trg_membership_fees_updated_at BEFORE UPDATE ON membership_fees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
