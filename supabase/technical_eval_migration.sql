-- =============================================
-- V_TECHNICAL_EVAL: Technical & Tactical Evaluation Module
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- =============================================

-- 1. player_development_indicators
CREATE TABLE IF NOT EXISTS player_development_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('strength','development')),
  category TEXT NOT NULL CHECK (category IN ('technical','tactical_attack','tactical_defense','decision','mental','behavior')),
  custom_indicator BOOLEAN DEFAULT FALSE,
  start_score INTEGER NOT NULL CHECK (start_score BETWEEN 1 AND 10),
  current_score INTEGER NOT NULL CHECK (current_score BETWEEN 1 AND 10),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  start_note TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  next_action TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id),
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pdi_team_player
  ON player_development_indicators(team_id, player_id, season)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdi_team_season
  ON player_development_indicators(team_id, season)
  WHERE deleted_at IS NULL;

-- 2. player_indicator_reviews
CREATE TABLE IF NOT EXISTS player_indicator_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  indicator_id UUID NOT NULL REFERENCES player_development_indicators(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('training','match','monthly','mid_season','end_season')),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  note TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  next_action TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id),
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pir_indicator
  ON player_indicator_reviews(indicator_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pir_team_player
  ON player_indicator_reviews(team_id, player_id)
  WHERE deleted_at IS NULL;

-- 3. player_indicator_audit_logs
CREATE TABLE IF NOT EXISTS player_indicator_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  indicator_id UUID REFERENCES player_development_indicators(id) ON DELETE CASCADE,
  review_id UUID REFERENCES player_indicator_reviews(id) ON DELETE SET NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pial_indicator ON player_indicator_audit_logs(indicator_id);
CREATE INDEX IF NOT EXISTS idx_pial_team ON player_indicator_audit_logs(team_id);

-- 4. team_evaluation_settings
CREATE TABLE IF NOT EXISTS team_evaluation_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  show_overall_score BOOLEAN DEFAULT TRUE,
  show_strength_average BOOLEAN DEFAULT TRUE,
  show_development_average BOOLEAN DEFAULT TRUE,
  minimum_indicators_for_overall_score INTEGER DEFAULT 5,
  require_note_for_score BOOLEAN DEFAULT TRUE,
  require_evidence_for_indicator BOOLEAN DEFAULT TRUE,
  allow_coach_to_hide_overall_score BOOLEAN DEFAULT TRUE,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE player_development_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_indicator_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_indicator_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_evaluation_settings ENABLE ROW LEVEL SECURITY;

-- player_development_indicators
DROP POLICY IF EXISTS "pdi_select" ON player_development_indicators;
DROP POLICY IF EXISTS "pdi_insert" ON player_development_indicators;
DROP POLICY IF EXISTS "pdi_update" ON player_development_indicators;
DROP POLICY IF EXISTS "pdi_delete" ON player_development_indicators;
CREATE POLICY "pdi_select" ON player_development_indicators
  FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "pdi_insert" ON player_development_indicators
  FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "pdi_update" ON player_development_indicators
  FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "pdi_delete" ON player_development_indicators
  FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- player_indicator_reviews
DROP POLICY IF EXISTS "pir_select" ON player_indicator_reviews;
DROP POLICY IF EXISTS "pir_insert" ON player_indicator_reviews;
DROP POLICY IF EXISTS "pir_update" ON player_indicator_reviews;
DROP POLICY IF EXISTS "pir_delete" ON player_indicator_reviews;
CREATE POLICY "pir_select" ON player_indicator_reviews
  FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "pir_insert" ON player_indicator_reviews
  FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "pir_update" ON player_indicator_reviews
  FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "pir_delete" ON player_indicator_reviews
  FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- player_indicator_audit_logs
DROP POLICY IF EXISTS "pial_select" ON player_indicator_audit_logs;
DROP POLICY IF EXISTS "pial_insert" ON player_indicator_audit_logs;
CREATE POLICY "pial_select" ON player_indicator_audit_logs
  FOR SELECT USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "pial_insert" ON player_indicator_audit_logs
  FOR INSERT WITH CHECK (is_team_member(team_id, auth.uid()));

-- team_evaluation_settings
DROP POLICY IF EXISTS "tes_select" ON team_evaluation_settings;
DROP POLICY IF EXISTS "tes_insert" ON team_evaluation_settings;
DROP POLICY IF EXISTS "tes_update" ON team_evaluation_settings;
CREATE POLICY "tes_select" ON team_evaluation_settings
  FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "tes_insert" ON team_evaluation_settings
  FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "tes_update" ON team_evaluation_settings
  FOR UPDATE USING (is_team_admin(team_id, auth.uid()));

-- ── END ──────────────────────────────────────────────────────────────────
