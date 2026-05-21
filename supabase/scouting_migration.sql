-- =============================================
-- Scouting Module Migration
-- قسم الكشافين وبنك اللاعبين المرشحين
-- Run after migration.sql
-- =============================================

-- ── Add scout role to team_members ───────────────────────────────────
DO $$
BEGIN
  ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
  ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
    CHECK (role IN (
      'owner','head_coach','assistant_coach','player','administrator',
      'media','medical','scout','parent','guest'
    ));
END $$;

-- ── scout_players: بنك اللاعبين المرشحين ─────────────────────────────
CREATE TABLE IF NOT EXISTS scout_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  city TEXT,
  current_club TEXT,
  primary_position TEXT,
  secondary_positions TEXT[] DEFAULT '{}',
  preferred_foot TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  phone TEXT,
  guardian_phone TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new','watching','needs_more_watch','trial_needed','trial_scheduled',
      'in_trial','signing_candidate','signed','rejected','deferred'
    )),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  assigned_scout_id UUID REFERENCES profiles(id),
  added_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── scout_reports: تقارير المشاهدة ───────────────────────────────────
CREATE TABLE IF NOT EXISTS scout_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scout_player_id UUID NOT NULL REFERENCES scout_players(id) ON DELETE CASCADE,
  scout_id UUID REFERENCES profiles(id),
  watch_date DATE NOT NULL,
  watch_type TEXT NOT NULL DEFAULT 'match'
    CHECK (watch_type IN ('match','training','video','tournament','trial','school','other')),
  location TEXT,
  opponent_or_event TEXT,
  position_played TEXT,
  minutes_played INTEGER,
  strengths TEXT,
  development_points TEXT,
  notes TEXT,
  recommendation TEXT NOT NULL DEFAULT 'follow'
    CHECK (recommendation IN ('follow','invite_trial','suitable','not_suitable','needs_time','high_priority')),
  technical_score NUMERIC DEFAULT 0,
  physical_score NUMERIC DEFAULT 0,
  tactical_score NUMERIC DEFAULT 0,
  mental_score NUMERIC DEFAULT 0,
  discipline_score NUMERIC DEFAULT 0,
  overall_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── scout_player_media: مقاطع ومرفقات اللاعب ─────────────────────────
CREATE TABLE IF NOT EXISTS scout_player_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scout_player_id UUID NOT NULL REFERENCES scout_players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'video'
    CHECK (media_type IN ('video','image','pdf','link','other')),
  url TEXT NOT NULL,
  notes TEXT,
  is_highlight BOOLEAN DEFAULT FALSE,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── scout_trials: تجارب الأداء الداخلية والخارجية ────────────────────
CREATE TABLE IF NOT EXISTS scout_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scout_player_id UUID NOT NULL REFERENCES scout_players(id) ON DELETE CASCADE,
  trial_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (trial_type IN ('internal','external')),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  location TEXT,
  trial_datetime TIMESTAMPTZ NOT NULL,
  assigned_scout_id UUID REFERENCES profiles(id),
  evaluator_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled','attended','absent','postponed','completed',
      'second_trial_needed','passed','not_suitable'
    )),
  position_tested TEXT,
  minutes_played INTEGER,
  attendance_status TEXT DEFAULT 'present'
    CHECK (attendance_status IN ('present','late','absent','unknown')),
  late_minutes INTEGER DEFAULT 0,
  pre_notes TEXT,
  result_notes TEXT,
  recommendation TEXT DEFAULT 'follow'
    CHECK (recommendation IN ('sign','second_trial','external_follow','reject','follow','negotiate')),
  technical_score NUMERIC DEFAULT 0,
  physical_score NUMERIC DEFAULT 0,
  tactical_score NUMERIC DEFAULT 0,
  mental_score NUMERIC DEFAULT 0,
  discipline_score NUMERIC DEFAULT 0,
  team_fit_score NUMERIC DEFAULT 0,
  overall_score NUMERIC DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── scout_status_logs: سجل انتقال الحالة ─────────────────────────────
CREATE TABLE IF NOT EXISTS scout_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scout_player_id UUID NOT NULL REFERENCES scout_players(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scout_players_team_status ON scout_players(team_id, status);
CREATE INDEX IF NOT EXISTS idx_scout_players_assigned ON scout_players(team_id, assigned_scout_id);
CREATE INDEX IF NOT EXISTS idx_scout_reports_player ON scout_reports(scout_player_id, watch_date);
CREATE INDEX IF NOT EXISTS idx_scout_media_player ON scout_player_media(scout_player_id);
CREATE INDEX IF NOT EXISTS idx_scout_trials_player ON scout_trials(scout_player_id, trial_datetime);
CREATE INDEX IF NOT EXISTS idx_scout_logs_player ON scout_status_logs(scout_player_id, created_at);

-- ── RLS helpers inline: owner/administrator/scout have access ────────
ALTER TABLE scout_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_player_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scout_players_select" ON scout_players;
DROP POLICY IF EXISTS "scout_players_insert" ON scout_players;
DROP POLICY IF EXISTS "scout_players_update" ON scout_players;
DROP POLICY IF EXISTS "scout_reports_select" ON scout_reports;
DROP POLICY IF EXISTS "scout_reports_insert" ON scout_reports;
DROP POLICY IF EXISTS "scout_reports_update" ON scout_reports;
DROP POLICY IF EXISTS "scout_media_select" ON scout_player_media;
DROP POLICY IF EXISTS "scout_media_insert" ON scout_player_media;
DROP POLICY IF EXISTS "scout_trials_select" ON scout_trials;
DROP POLICY IF EXISTS "scout_trials_insert" ON scout_trials;
DROP POLICY IF EXISTS "scout_trials_update" ON scout_trials;
DROP POLICY IF EXISTS "scout_logs_select" ON scout_status_logs;
DROP POLICY IF EXISTS "scout_logs_insert" ON scout_status_logs;

CREATE POLICY "scout_players_select" ON scout_players FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_players.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','scout')
  )
);
CREATE POLICY "scout_players_insert" ON scout_players FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_players.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','scout')
  )
);
CREATE POLICY "scout_players_update" ON scout_players FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_players.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','scout')
  )
);

CREATE POLICY "scout_reports_select" ON scout_reports FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_reports.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','scout')
  )
);
CREATE POLICY "scout_reports_insert" ON scout_reports FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_reports.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);
CREATE POLICY "scout_reports_update" ON scout_reports FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_reports.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);

CREATE POLICY "scout_media_select" ON scout_player_media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_player_media.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','scout')
  )
);
CREATE POLICY "scout_media_insert" ON scout_player_media FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_player_media.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);

CREATE POLICY "scout_trials_select" ON scout_trials FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_trials.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','scout')
  )
);
CREATE POLICY "scout_trials_insert" ON scout_trials FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_trials.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);
CREATE POLICY "scout_trials_update" ON scout_trials FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_trials.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);

CREATE POLICY "scout_logs_select" ON scout_status_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_status_logs.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','scout')
  )
);
CREATE POLICY "scout_logs_insert" ON scout_status_logs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = scout_status_logs.team_id AND tm.user_id = auth.uid()
      AND tm.status = 'active' AND tm.role IN ('owner','administrator','scout')
  )
);

NOTIFY pgrst, 'reload schema';
