-- Fitness Measurements Migration
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- FITNESS TEST RESULTS
CREATE TABLE IF NOT EXISTS player_fitness_test_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Official result (selected by coach or auto-suggested by system)
  official_result NUMERIC,
  official_result_unit TEXT,
  official_attempt_index INTEGER,
  official_selected_by UUID REFERENCES profiles(id),
  coach_override_reason TEXT,

  -- All raw attempt data (attempts[], calculated fields, side data, etc.)
  result_data JSONB NOT NULL DEFAULT '{}',

  -- Context
  notes TEXT,
  conditions TEXT,

  -- Audit
  edit_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id),
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pftr_team_id ON player_fitness_test_results(team_id);
CREATE INDEX IF NOT EXISTS idx_pftr_player_id ON player_fitness_test_results(player_id);
CREATE INDEX IF NOT EXISTS idx_pftr_test_key ON player_fitness_test_results(test_key);
CREATE INDEX IF NOT EXISTS idx_pftr_test_date ON player_fitness_test_results(test_date);
CREATE INDEX IF NOT EXISTS idx_pftr_player_test ON player_fitness_test_results(player_id, test_key);
CREATE INDEX IF NOT EXISTS idx_pftr_team_player ON player_fitness_test_results(team_id, player_id);
CREATE INDEX IF NOT EXISTS idx_pftr_deleted_at ON player_fitness_test_results(deleted_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pftr_official_attempt') THEN
    ALTER TABLE player_fitness_test_results ADD CONSTRAINT chk_pftr_official_attempt CHECK (official_attempt_index IS NULL OR official_attempt_index >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pftr_edit_count') THEN
    ALTER TABLE player_fitness_test_results ADD CONSTRAINT chk_pftr_edit_count CHECK (edit_count >= 0 AND edit_count <= 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pftr_test_key') THEN
    ALTER TABLE player_fitness_test_results ADD CONSTRAINT chk_pftr_test_key CHECK (char_length(test_key) > 0);
  END IF;
END $$;

-- FITNESS TEST AUDIT LOGS
CREATE TABLE IF NOT EXISTS player_fitness_test_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES player_fitness_test_results(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete')),
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_pftal_result_id ON player_fitness_test_audit_logs(result_id);
CREATE INDEX IF NOT EXISTS idx_pftal_team_id ON player_fitness_test_audit_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_pftal_player_id ON player_fitness_test_audit_logs(player_id);

-- RLS
ALTER TABLE player_fitness_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_fitness_test_audit_logs ENABLE ROW LEVEL SECURITY;

-- All active team members can read fitness results
CREATE POLICY "team_members_read_fitness_results" ON player_fitness_test_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_fitness_test_results.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
    )
  );

-- Only coaches/admins can insert
CREATE POLICY "coaches_insert_fitness_results" ON player_fitness_test_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_fitness_test_results.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );

-- Only coaches/admins can update
CREATE POLICY "coaches_update_fitness_results" ON player_fitness_test_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_fitness_test_results.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );

-- All active team members can read audit logs
CREATE POLICY "team_members_read_fitness_audits" ON player_fitness_test_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_fitness_test_audit_logs.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
    )
  );

-- Only coaches/admins can insert audit logs
CREATE POLICY "coaches_insert_fitness_audits" ON player_fitness_test_audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_fitness_test_audit_logs.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );
