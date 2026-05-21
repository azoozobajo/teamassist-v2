-- =============================================
-- Training Plan Module Migration
-- قسم الخطة التدريبية
-- Run after migration.sql
-- =============================================

-- ── training_phases: مراحل الموسم ────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phase_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (phase_type IN ('preparation','early','mid','late','off','custom')),
  start_date DATE,
  end_date DATE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_phase_goals: أهداف المرحلة ──────────────────────────────
CREATE TABLE IF NOT EXISTS training_phase_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES training_phases(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  achievement_pct INT NOT NULL DEFAULT 0
    CHECK (achievement_pct >= 0 AND achievement_pct <= 100),
  achievement_notes TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_themes: مواضيع أسبوعية ──────────────────────────────────
CREATE TABLE IF NOT EXISTS training_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES training_phases(id) ON DELETE SET NULL,
  week_start_date DATE NOT NULL,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  partial_goal TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_exercises: مكتبة التمارين ───────────────────────────────
CREATE TABLE IF NOT EXISTS training_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  section TEXT NOT NULL DEFAULT 'main'
    CHECK (section IN ('warmup','main','cooldown')),
  category TEXT NOT NULL DEFAULT 'technical'
    CHECK (category IN ('technical','tactical','physical','gk','mental')),
  location TEXT NOT NULL DEFAULT 'pitch'
    CHECK (location IN ('pitch','gym','indoor','sand','pool')),
  player_count_min INT NOT NULL DEFAULT 2,
  duration_min INT NOT NULL DEFAULT 10,
  equipment TEXT[] DEFAULT '{}',
  technical_points TEXT,
  variables TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_sessions: الوحدات التدريبية ─────────────────────────────
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES training_phases(id) ON DELETE SET NULL,
  theme_id UUID REFERENCES training_themes(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TIME,
  duration_min INT NOT NULL DEFAULT 90,
  category TEXT NOT NULL DEFAULT 'first_team'
    CHECK (category IN ('first_team','u23','u18','gk_only','fitness_only','individual')),
  title TEXT NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'medium'
    CHECK (intensity IN ('low','medium','high','recovery')),
  md_tag TEXT
    CHECK (md_tag IN ('md-4','md-3','md-2','md-1','md','md+1','md+2','free')),
  match_event_id UUID,
  tactical_goal TEXT,
  physical_goal TEXT,
  gk_goal TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_session_blocks: أقسام الوحدة ────────────────────────────
-- block_type: warmup (احماء), main (أساسي - يمكن تعدده), cooldown (تهدئة), individual (فردي)
CREATE TABLE IF NOT EXISTS training_session_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  block_type TEXT NOT NULL DEFAULT 'main'
    CHECK (block_type IN ('warmup','main','cooldown','individual')),
  title TEXT,
  start_offset_min INT DEFAULT 0,
  duration_min INT DEFAULT 20,
  content_hc TEXT,
  content_fc TEXT,
  content_gkt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_individual_assignments: برامج فردية داخل الوحدة ─────────
CREATE TABLE IF NOT EXISTS training_individual_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES training_session_blocks(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL DEFAULT 'other'
    CHECK (reason IN ('recovery','injury','fitness','tactical','other')),
  program_content TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_block_exercises: تمارين مرتبطة بالأقسام ─────────────────
CREATE TABLE IF NOT EXISTS training_block_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES training_session_blocks(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES training_exercises(id) ON DELETE SET NULL,
  custom_name TEXT,
  custom_description TEXT,
  assigned_to TEXT NOT NULL DEFAULT 'all'
    CHECK (assigned_to IN ('hc','fc','gkt','all')),
  order_index INT NOT NULL DEFAULT 0,
  duration_min INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_session_comments: تعليقات الطاقم على الوحدة ─────────────
CREATE TABLE IF NOT EXISTS training_session_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  author_role TEXT NOT NULL DEFAULT 'hc'
    CHECK (author_role IN ('hc','fc','gkt','assistant','other')),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── training_exercise_comments: تعليقات الطاقم على التمرين ───────────
CREATE TABLE IF NOT EXISTS training_exercise_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES training_exercises(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  author_role TEXT NOT NULL DEFAULT 'hc'
    CHECK (author_role IN ('hc','fc','gkt','assistant','other')),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_phases_team ON training_phases(team_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_phase_goals_phase ON training_phase_goals(phase_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_themes_team ON training_themes(team_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_training_exercises_team ON training_exercises(team_id, section, category);
CREATE INDEX IF NOT EXISTS idx_training_sessions_team ON training_sessions(team_id, date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_phase ON training_sessions(phase_id, date);
CREATE INDEX IF NOT EXISTS idx_training_blocks_session ON training_session_blocks(session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_training_individual_block ON training_individual_assignments(block_id);
CREATE INDEX IF NOT EXISTS idx_training_block_ex ON training_block_exercises(block_id, order_index);
CREATE INDEX IF NOT EXISTS idx_training_session_comments ON training_session_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_training_exercise_comments ON training_exercise_comments(exercise_id);

-- ── Row Level Security ────────────────────────────────────────────────
ALTER TABLE training_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_phase_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_session_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_individual_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_block_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_session_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_exercise_comments ENABLE ROW LEVEL SECURITY;

-- Helper: can this user view/manage training for a team
-- View: owner, administrator, head_coach, assistant_coach, medical
-- Manage (write): owner, administrator, head_coach, assistant_coach

DROP POLICY IF EXISTS "tp_select" ON training_phases;
DROP POLICY IF EXISTS "tp_insert" ON training_phases;
DROP POLICY IF EXISTS "tp_update" ON training_phases;
DROP POLICY IF EXISTS "tp_delete" ON training_phases;

CREATE POLICY "tp_select" ON training_phases FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phases.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
);
CREATE POLICY "tp_insert" ON training_phases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phases.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);
CREATE POLICY "tp_update" ON training_phases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phases.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);
CREATE POLICY "tp_delete" ON training_phases FOR DELETE USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phases.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach'))
);

DROP POLICY IF EXISTS "tpg_all" ON training_phase_goals;
CREATE POLICY "tpg_all" ON training_phase_goals FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phase_goals.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_phase_goals.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

DROP POLICY IF EXISTS "tth_all" ON training_themes;
CREATE POLICY "tth_all" ON training_themes FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_themes.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_themes.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

DROP POLICY IF EXISTS "tex_select" ON training_exercises;
DROP POLICY IF EXISTS "tex_write" ON training_exercises;
CREATE POLICY "tex_select" ON training_exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_exercises.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
);
CREATE POLICY "tex_write" ON training_exercises FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_exercises.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_exercises.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

DROP POLICY IF EXISTS "ts_select" ON training_sessions;
DROP POLICY IF EXISTS "ts_write" ON training_sessions;
CREATE POLICY "ts_select" ON training_sessions FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_sessions.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
);
CREATE POLICY "ts_write" ON training_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_sessions.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_sessions.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

-- Blocks, individual assignments, block exercises: same as sessions
DROP POLICY IF EXISTS "tsb_all" ON training_session_blocks;
CREATE POLICY "tsb_all" ON training_session_blocks FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_session_blocks.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_session_blocks.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

DROP POLICY IF EXISTS "tia_all" ON training_individual_assignments;
CREATE POLICY "tia_all" ON training_individual_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_individual_assignments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_individual_assignments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

DROP POLICY IF EXISTS "tbe_all" ON training_block_exercises;
CREATE POLICY "tbe_all" ON training_block_exercises FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_block_exercises.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_block_exercises.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach'))
);

-- Comments: all coaching staff can write their own comments
DROP POLICY IF EXISTS "tsc_all" ON training_session_comments;
CREATE POLICY "tsc_all" ON training_session_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_session_comments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_session_comments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
);

DROP POLICY IF EXISTS "tec_all" ON training_exercise_comments;
CREATE POLICY "tec_all" ON training_exercise_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_exercise_comments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
) WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = training_exercise_comments.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical','scout'))
);

NOTIFY pgrst, 'reload schema';
