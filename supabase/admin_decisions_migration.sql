-- Admin decisions and leave categories that automatically mark attendance as excused.

ALTER TABLE leaves ADD COLUMN IF NOT EXISTS leave_type TEXT DEFAULT 'other';

DO $$
BEGIN
  ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_leave_type_check;
  ALTER TABLE leaves ADD CONSTRAINT leaves_leave_type_check
    CHECK (leave_type IN ('suspension','national_team','injury','penalty','rest','emergency','other'));
END $$;

CREATE TABLE IF NOT EXISTS admin_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  decision_type TEXT NOT NULL DEFAULT 'other'
    CHECK (decision_type IN ('suspension','national_team','injury','penalty','rest','emergency','other')),
  target_type TEXT NOT NULL DEFAULT 'specific'
    CHECK (target_type IN ('all','specific')),
  target_user_ids UUID[] DEFAULT '{}',
  notes TEXT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE admin_decisions DROP CONSTRAINT IF EXISTS admin_decisions_decision_type_check;
  ALTER TABLE admin_decisions ADD CONSTRAINT admin_decisions_decision_type_check
    CHECK (decision_type IN ('suspension','national_team','injury','penalty','rest','emergency','other'));
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_decisions_team ON admin_decisions(team_id);
CREATE INDEX IF NOT EXISTS idx_admin_decisions_dates ON admin_decisions(team_id, from_date, to_date);

ALTER TABLE admin_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_decisions_select" ON admin_decisions;
DROP POLICY IF EXISTS "admin_decisions_insert" ON admin_decisions;
DROP POLICY IF EXISTS "admin_decisions_update" ON admin_decisions;

CREATE POLICY "admin_decisions_select" ON admin_decisions
  FOR SELECT USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "admin_decisions_insert" ON admin_decisions
  FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));

CREATE POLICY "admin_decisions_update" ON admin_decisions
  FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
