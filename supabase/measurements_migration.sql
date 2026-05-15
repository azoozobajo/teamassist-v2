-- Measurements Migration
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- PLAYER BASIC MEASUREMENTS
CREATE TABLE IF NOT EXISTS player_basic_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Physical measurements
  standing_height_cm NUMERIC(5,1),
  sitting_height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,2),

  -- Body composition
  body_fat_percent NUMERIC(5,2),
  body_fat_mass_kg NUMERIC(5,2),
  muscle_percent NUMERIC(5,2),
  muscle_mass_kg NUMERIC(5,2),

  -- Time & method & notes
  measurement_time TIME,
  measurement_method TEXT DEFAULT 'يدوي',
  notes TEXT,

  -- Audit fields
  edit_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id),
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pbm_team_id ON player_basic_measurements(team_id);
CREATE INDEX IF NOT EXISTS idx_pbm_player_id ON player_basic_measurements(player_id);
CREATE INDEX IF NOT EXISTS idx_pbm_date ON player_basic_measurements(measurement_date);
CREATE INDEX IF NOT EXISTS idx_pbm_team_player ON player_basic_measurements(team_id, player_id);
CREATE INDEX IF NOT EXISTS idx_pbm_deleted_at ON player_basic_measurements(deleted_at);

-- DB-level constraints for obvious invalid values
ALTER TABLE player_basic_measurements
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_standing_height CHECK (standing_height_cm IS NULL OR (standing_height_cm >= 0 AND standing_height_cm <= 300)),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_sitting_height CHECK (sitting_height_cm IS NULL OR (sitting_height_cm >= 0 AND sitting_height_cm <= 300)),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_sitting_le_standing CHECK (sitting_height_cm IS NULL OR standing_height_cm IS NULL OR sitting_height_cm <= standing_height_cm),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_weight CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 500)),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_fat_percent CHECK (body_fat_percent IS NULL OR (body_fat_percent >= 0 AND body_fat_percent <= 100)),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_fat_mass CHECK (body_fat_mass_kg IS NULL OR body_fat_mass_kg >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_muscle_percent CHECK (muscle_percent IS NULL OR (muscle_percent >= 0 AND muscle_percent <= 100)),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_muscle_mass CHECK (muscle_mass_kg IS NULL OR muscle_mass_kg >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_pbm_edit_count CHECK (edit_count >= 0 AND edit_count <= 3);

-- MEASUREMENT AUDITS
CREATE TABLE IF NOT EXISTS player_basic_measurement_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  measurement_id UUID NOT NULL REFERENCES player_basic_measurements(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create','edit','delete')),
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_pbma_measurement_id ON player_basic_measurement_audits(measurement_id);
CREATE INDEX IF NOT EXISTS idx_pbma_team_id ON player_basic_measurement_audits(team_id);

-- RLS
ALTER TABLE player_basic_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_basic_measurement_audits ENABLE ROW LEVEL SECURITY;

-- Team members can read measurements for their team
CREATE POLICY "team_members_read_measurements" ON player_basic_measurements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_basic_measurements.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
    )
  );

-- Only coaches/admins can insert
CREATE POLICY "coaches_insert_measurements" ON player_basic_measurements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_basic_measurements.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );

-- Only coaches/admins can update
CREATE POLICY "coaches_update_measurements" ON player_basic_measurements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_basic_measurements.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );

-- Audit log: team members can read
CREATE POLICY "team_members_read_audits" ON player_basic_measurement_audits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_basic_measurement_audits.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
    )
  );

-- Audit log: coaches/admins can insert
CREATE POLICY "coaches_insert_audits" ON player_basic_measurement_audits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = player_basic_measurement_audits.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
        AND team_members.role IN ('owner','administrator','head_coach','assistant_coach','medical')
    )
  );
