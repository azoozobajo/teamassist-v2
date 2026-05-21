-- =============================================
-- Scout Needs Migration
-- احتياجات النادي من اللاعبين
-- Run after scouting_migration.sql
-- =============================================

CREATE TABLE IF NOT EXISTS scout_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- What the club needs
  position TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Age range
  min_age INTEGER,
  max_age INTEGER,

  -- Physical specs
  min_height_cm INTEGER,
  max_height_cm INTEGER,
  min_weight_kg INTEGER,
  max_weight_kg INTEGER,

  -- Profile preferences
  nationality TEXT,
  preferred_foot TEXT
    CHECK (preferred_foot IN ('right', 'left', 'both')),

  -- Tags (free labels stored as arrays)
  physical_tags TEXT[] DEFAULT '{}',
  tactical_tags TEXT[] DEFAULT '{}',

  -- Extra
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_needs_team
  ON scout_needs(team_id, is_active);

-- ── Row Level Security ──────────────────────────────────────────────────
ALTER TABLE scout_needs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sn_select" ON scout_needs;
DROP POLICY IF EXISTS "sn_insert" ON scout_needs;
DROP POLICY IF EXISTS "sn_update" ON scout_needs;
DROP POLICY IF EXISTS "sn_delete" ON scout_needs;

-- All scouting-visible roles can read needs
CREATE POLICY "sn_select" ON scout_needs FOR SELECT USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND permission IN ('manage_scouting', 'view_scouting')
  )
  OR EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'administrator', 'head_coach', 'assistant_coach', 'scout')
  )
);

-- Admin, head coach, scout can insert
CREATE POLICY "sn_insert" ON scout_needs FOR INSERT WITH CHECK (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND permission = 'manage_scouting'
  )
  OR EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'administrator', 'head_coach', 'scout')
  )
);

-- Same roles can update
CREATE POLICY "sn_update" ON scout_needs FOR UPDATE USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND permission = 'manage_scouting'
  )
  OR EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'administrator', 'head_coach', 'scout')
  )
);

-- Only admin and head coach can delete
CREATE POLICY "sn_delete" ON scout_needs FOR DELETE USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = scout_needs.team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'administrator', 'head_coach')
  )
);
