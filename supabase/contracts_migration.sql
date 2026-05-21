-- =============================================
-- Contracts Module Migration
-- العقود والالتزامات المالية لمنسوبي الفريق
-- Run after migration.sql
-- =============================================

-- ── contracts: العقد الرئيسي ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'player',
  contract_party_type TEXT NOT NULL DEFAULT 'player'
    CHECK (contract_party_type IN ('player','technical_staff','medical_staff','administration','scout','media','other')),
  contract_type TEXT NOT NULL DEFAULT 'professional'
    CHECK (contract_type IN ('professional','amateur','staff','temporary','trial','loan','volunteer','other')),
  contract_status TEXT NOT NULL DEFAULT 'active'
    CHECK (contract_status IN ('draft','active','expired','terminated','suspended','renewal_pending','transferred','released')),
  start_date DATE NOT NULL,
  end_date DATE,
  signing_date DATE,

  -- Player acquisition
  acquisition_type TEXT
    CHECK (acquisition_type IN ('purchase','free_transfer','loan','academy_promotion','trial_to_sign','renewal','other')),
  previous_club TEXT,
  agent_name TEXT,
  agent_phone TEXT,
  transfer_fee NUMERIC DEFAULT 0,
  release_clause NUMERIC DEFAULT 0,
  sell_on_percentage NUMERIC DEFAULT 0,

  -- Financial summary
  currency TEXT NOT NULL DEFAULT 'SAR',
  monthly_salary NUMERIC DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  payment_day INT DEFAULT 1,
  payment_method TEXT,
  bank_info TEXT,

  -- Staff details
  job_title_id UUID,
  job_title TEXT,
  work_type TEXT CHECK (work_type IN ('full_time','part_time','remote','seasonal','consultant','other')),
  department TEXT,
  direct_manager TEXT,

  notes TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibility patch if this migration was already run before remote/job library
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_title_id UUID;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_party_type TEXT DEFAULT 'player';

DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'contracts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%contract_party_type%'
  LIMIT 1;

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I', c_name);
  END IF;

  ALTER TABLE contracts ADD CONSTRAINT contracts_party_type_check
    CHECK (contract_party_type IN ('player','technical_staff','medical_staff','administration','scout','media','other'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'contracts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%work_type%'
  LIMIT 1;

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I', c_name);
  END IF;

  ALTER TABLE contracts ADD CONSTRAINT contracts_work_type_check
    CHECK (work_type IN ('full_time','part_time','remote','seasonal','consultant','other'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── contract_job_titles: مكتبة الوظائف ──────────────────────────────
CREATE TABLE IF NOT EXISTS contract_job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, name)
);

-- ── contract_benefits: البنود والامتيازات ───────────────────────────
CREATE TABLE IF NOT EXISTS contract_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  benefit_type TEXT NOT NULL DEFAULT 'financial'
    CHECK (benefit_type IN ('financial','non_financial','bonus','clause','deduction','other')),
  amount NUMERIC DEFAULT 0,
  is_recurring BOOLEAN DEFAULT FALSE,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── contract_payments: الرواتب والمدفوعات ────────────────────────────
CREATE TABLE IF NOT EXISTS contract_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL DEFAULT 'salary'
    CHECK (payment_type IN ('salary','bonus','allowance','installment','deduction','settlement','other')),
  period_label TEXT,
  due_date DATE,
  amount_due NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  paid_at DATE,
  payment_status TEXT NOT NULL DEFAULT 'due'
    CHECK (payment_status IN ('due','partial','paid','overdue','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── contract_loans: الإعارات والتنقلات ───────────────────────────────
CREATE TABLE IF NOT EXISTS contract_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  loan_direction TEXT NOT NULL DEFAULT 'out'
    CHECK (loan_direction IN ('in','out')),
  other_club TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE,
  salary_covered_by TEXT DEFAULT 'team'
    CHECK (salary_covered_by IN ('team','other_club','shared')),
  salary_coverage_percentage NUMERIC DEFAULT 100,
  has_buy_option BOOLEAN DEFAULT FALSE,
  buy_option_amount NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── contract_status_logs: سجل الحالة ────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_team_status ON contracts(team_id, contract_status);
CREATE INDEX IF NOT EXISTS idx_contracts_member ON contracts(team_id, member_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(team_id, end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_party_type ON contracts(team_id, contract_party_type);
CREATE INDEX IF NOT EXISTS idx_contracts_job_title ON contracts(team_id, job_title_id);
CREATE INDEX IF NOT EXISTS idx_contract_job_titles_team ON contract_job_titles(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_contract_payments_contract ON contract_payments(contract_id, due_date);
CREATE INDEX IF NOT EXISTS idx_contract_payments_team_status ON contract_payments(team_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_contract_loans_team_status ON contract_loans(team_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_benefits_contract ON contract_benefits(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_logs_contract ON contract_status_logs(contract_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_admin_all" ON contracts;
DROP POLICY IF EXISTS "contract_job_titles_admin_all" ON contract_job_titles;
DROP POLICY IF EXISTS "contract_benefits_admin_all" ON contract_benefits;
DROP POLICY IF EXISTS "contract_payments_admin_all" ON contract_payments;
DROP POLICY IF EXISTS "contract_loans_admin_all" ON contract_loans;
DROP POLICY IF EXISTS "contract_logs_admin_select" ON contract_status_logs;
DROP POLICY IF EXISTS "contract_logs_admin_insert" ON contract_status_logs;

CREATE POLICY "contracts_admin_all" ON contracts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = contracts.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = contracts.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator')
  )
);

CREATE POLICY "contract_job_titles_admin_all" ON contract_job_titles FOR ALL USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = contract_job_titles.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = contract_job_titles.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator')
  )
);

CREATE POLICY "contract_benefits_admin_all" ON contract_benefits FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_benefits.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_benefits.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
);

CREATE POLICY "contract_payments_admin_all" ON contract_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_payments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_payments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
);

CREATE POLICY "contract_loans_admin_all" ON contract_loans FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_loans.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_loans.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
);

CREATE POLICY "contract_logs_admin_select" ON contract_status_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_status_logs.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
);

CREATE POLICY "contract_logs_admin_insert" ON contract_status_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = contract_status_logs.team_id AND tm.user_id = auth.uid() AND tm.status = 'active' AND tm.role IN ('owner','administrator'))
);

NOTIFY pgrst, 'reload schema';
