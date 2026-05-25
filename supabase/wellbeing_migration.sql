-- =============================================
-- Player Wellbeing Migration
-- متابعة الجاهزية والرفاهية اليومية للاعبين
-- Run after migration.sql and medical_cases_migration.sql
-- =============================================

CREATE TABLE IF NOT EXISTS player_wellbeing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 1 = poor/low, 5 = excellent/high depending on metric meaning
  sleep_quality INT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  fatigue_level INT NOT NULL CHECK (fatigue_level BETWEEN 1 AND 5),
  muscle_soreness INT NOT NULL CHECK (muscle_soreness BETWEEN 1 AND 5),
  stress_level INT NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  mood_level INT NOT NULL CHECK (mood_level BETWEEN 1 AND 5),
  energy_level INT NOT NULL DEFAULT 3 CHECK (energy_level BETWEEN 1 AND 5),

  pain_area TEXT,
  notes TEXT,

  readiness_score INT NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'green'
    CHECK (status IN ('green','yellow','red')),

  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  medical_note TEXT,

  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, player_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_wellbeing_team_date
  ON player_wellbeing_entries(team_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_wellbeing_player_date
  ON player_wellbeing_entries(team_id, player_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_wellbeing_status
  ON player_wellbeing_entries(team_id, status, entry_date DESC);

ALTER TABLE player_wellbeing_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wellbeing_select" ON player_wellbeing_entries;
DROP POLICY IF EXISTS "wellbeing_insert" ON player_wellbeing_entries;
DROP POLICY IF EXISTS "wellbeing_update" ON player_wellbeing_entries;
DROP POLICY IF EXISTS "wellbeing_delete" ON player_wellbeing_entries;

-- Player sees own entries; admin/coach/medical can view team entries.
CREATE POLICY "wellbeing_select" ON player_wellbeing_entries FOR SELECT USING (
  auth.uid() = player_id
  OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = player_wellbeing_entries.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

-- Player can submit/update own daily entry; admin/medical can enter on behalf if needed.
CREATE POLICY "wellbeing_insert" ON player_wellbeing_entries FOR INSERT WITH CHECK (
  auth.uid() = player_id
  OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = player_wellbeing_entries.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','medical')
  )
);

CREATE POLICY "wellbeing_update" ON player_wellbeing_entries FOR UPDATE USING (
  auth.uid() = player_id
  OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = player_wellbeing_entries.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','medical')
  )
) WITH CHECK (
  auth.uid() = player_id
  OR EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = player_wellbeing_entries.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','medical')
  )
);

CREATE POLICY "wellbeing_delete" ON player_wellbeing_entries FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = player_wellbeing_entries.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','medical')
  )
);

NOTIFY pgrst, 'reload schema';
