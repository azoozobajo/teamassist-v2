-- TeamAssist v2 Full Migration
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  first_name TEXT, last_name TEXT, father_name TEXT,
  avatar_url TEXT, phone TEXT, date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male','female')),
  email TEXT, profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, sport_type TEXT DEFAULT 'كرة القدم',
  age_category TEXT, city TEXT, description TEXT, logo_url TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT upper(substring(replace(uuid_generate_v4()::TEXT,'-',''),1,8)),
  invite_code_enabled BOOLEAN DEFAULT TRUE,
  require_approval BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEAM MEMBERS
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player'
    CHECK (role IN ('owner','head_coach','assistant_coach','player','administrator','media','medical','parent','guest')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  is_visible BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(), removed_at TIMESTAMPTZ,
  UNIQUE(team_id, user_id)
);

-- JOIN REQUESTS
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT, reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RECURRENCE GROUPS
CREATE TABLE IF NOT EXISTS recurrence_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, event_type TEXT DEFAULT 'training',
  days_of_week INTEGER[] NOT NULL,
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  start_time TIME NOT NULL, end_time TIME,
  location TEXT, map_url TEXT, att_group TEXT DEFAULT 'الكل',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENTS
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  recurrence_group_id UUID REFERENCES recurrence_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT DEFAULT 'training'
    CHECK (event_type IN ('training','match','meeting','camp','other')),
  start_datetime TIMESTAMPTZ NOT NULL, end_datetime TIMESTAMPTZ,
  location TEXT, map_url TEXT, description TEXT,
  att_group TEXT DEFAULT 'الكل',
  is_locked BOOLEAN DEFAULT FALSE,
  default_status TEXT DEFAULT 'present',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'present' CHECK (status IN ('present','absent','uncertain','late')),
  late_minutes INTEGER DEFAULT 0,
  late_excuse TEXT, has_excuse BOOLEAN DEFAULT FALSE,
  member_note TEXT, admin_note TEXT,
  marked_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT DEFAULT '',
  announcement_type TEXT DEFAULT 'general',
  is_poll BOOLEAN DEFAULT FALSE,
  poll_options JSONB, poll_limit INTEGER DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POLL VOTES
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- FINANCIAL OBLIGATIONS
CREATE TABLE IF NOT EXISTS financial_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, amount NUMERIC(10,2) DEFAULT 0,
  due_date DATE,
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all','role','specific')),
  target_role TEXT, target_user_ids UUID[],
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  obligation_id UUID NOT NULL REFERENCES financial_obligations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) DEFAULT 0,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid')),
  paid_at TIMESTAMPTZ, recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(obligation_id, user_id)
);

-- LEAVES
CREATE TABLE IF NOT EXISTS leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, from_date DATE NOT NULL, to_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','partial')),
  note TEXT, partial_days TEXT[],
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- COACH NOTES
CREATE TABLE IF NOT EXISTS coach_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_type TEXT DEFAULT 'توجيه' CHECK (note_type IN ('مدح','توجيه','تحذير','تطوير')),
  content TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  event_title TEXT, is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INJURIES
CREATE TABLE IF NOT EXISTS injuries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL, injury_date DATE,
  recovery_status TEXT DEFAULT 'يتعافى' CHECK (recovery_status IN ('يتعافى','تعافى')),
  notes TEXT, recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POINTS TRANSACTIONS
CREATE TABLE IF NOT EXISTS points_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'مكافأة',
  reason TEXT NOT NULL, is_auto BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUTO POINT SETTINGS
CREATE TABLE IF NOT EXISTS auto_point_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_trigger TEXT NOT NULL, points INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(team_id, event_trigger)
);

-- COMPETITIONS
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL, from_date DATE, to_date DATE,
  prize TEXT, winner_id UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DIRECT MESSAGES
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL, is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SECRET REPORTS
CREATE TABLE IF NOT EXISTS secret_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL,
  tag TEXT DEFAULT 'ملاحظة', visible_to TEXT DEFAULT 'الجهاز الفني فقط',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, type TEXT DEFAULT 'general',
  link TEXT, is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVITATIONS
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'player', status TEXT DEFAULT 'pending',
  token TEXT, invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tm_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tm_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ev_team ON events(team_id);
CREATE INDEX IF NOT EXISTS idx_ev_start ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_ev_group ON events(recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_att_event ON attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_pts_team ON points_transactions(team_id);
CREATE INDEX IF NOT EXISTS idx_pts_user ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_team ON direct_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_team ON chat_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_notes_player ON coach_notes(player_id);
CREATE INDEX IF NOT EXISTS idx_leaves_team ON leaves(team_id);
CREATE INDEX IF NOT EXISTS idx_join_req ON join_requests(team_id);

-- UPDATED_AT trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_profiles_upd ON profiles;
DROP TRIGGER IF EXISTS trg_teams_upd ON teams;
DROP TRIGGER IF EXISTS trg_events_upd ON events;
DROP TRIGGER IF EXISTS trg_att_upd ON attendance;
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_teams_upd BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_events_upd BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_att_upd BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- POINTS LEADERBOARD FUNCTION
CREATE OR REPLACE FUNCTION get_points_leaderboard(p_team_id UUID)
RETURNS TABLE(user_id UUID, full_name TEXT, avatar_url TEXT, total_points BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT pt.user_id, p.full_name, p.avatar_url, SUM(pt.points)::BIGINT as total_points
  FROM points_transactions pt JOIN profiles p ON p.id = pt.user_id
  WHERE pt.team_id = p_team_id
  GROUP BY pt.user_id, p.full_name, p.avatar_url
  ORDER BY total_points DESC;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ENABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_point_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM team_members
    WHERE team_id=p_team_id AND user_id=p_user_id AND status='active' AND removed_at IS NULL);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM team_members
    WHERE team_id=p_team_id AND user_id=p_user_id AND status='active' AND removed_at IS NULL
    AND role IN ('owner','administrator','head_coach','assistant_coach'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS POLICIES
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid()=id);

DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_insert" ON teams;
DROP POLICY IF EXISTS "teams_update" ON teams;
CREATE POLICY "teams_select" ON teams FOR SELECT USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT WITH CHECK (auth.uid()=created_by);
CREATE POLICY "teams_update" ON teams FOR UPDATE USING (is_team_admin(id,auth.uid()));

DROP POLICY IF EXISTS "tm_select" ON team_members;
DROP POLICY IF EXISTS "tm_insert" ON team_members;
DROP POLICY IF EXISTS "tm_update" ON team_members;
DROP POLICY IF EXISTS "tm_delete" ON team_members;
CREATE POLICY "tm_select" ON team_members FOR SELECT USING (is_team_member(team_id,auth.uid()) OR auth.uid()=user_id);
CREATE POLICY "tm_insert" ON team_members FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()) OR auth.uid()=user_id);
CREATE POLICY "tm_update" ON team_members FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tm_delete" ON team_members FOR DELETE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "jr_select" ON join_requests;
DROP POLICY IF EXISTS "jr_insert" ON join_requests;
DROP POLICY IF EXISTS "jr_update" ON join_requests;
CREATE POLICY "jr_select" ON join_requests FOR SELECT USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "jr_insert" ON join_requests FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "jr_update" ON join_requests FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "rg_select" ON recurrence_groups;
DROP POLICY IF EXISTS "rg_insert" ON recurrence_groups;
DROP POLICY IF EXISTS "rg_update" ON recurrence_groups;
DROP POLICY IF EXISTS "rg_delete" ON recurrence_groups;
CREATE POLICY "rg_select" ON recurrence_groups FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "rg_insert" ON recurrence_groups FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rg_update" ON recurrence_groups FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rg_delete" ON recurrence_groups FOR DELETE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "ev_select" ON events;
DROP POLICY IF EXISTS "ev_insert" ON events;
DROP POLICY IF EXISTS "ev_update" ON events;
DROP POLICY IF EXISTS "ev_delete" ON events;
CREATE POLICY "ev_select" ON events FOR SELECT USING (
  is_team_member(team_id, auth.uid())
  OR EXISTS (SELECT 1 FROM attendance WHERE event_id = id AND user_id = auth.uid())
);
CREATE POLICY "ev_insert" ON events FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "ev_update" ON events FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "ev_delete" ON events FOR DELETE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "att_select" ON attendance;
DROP POLICY IF EXISTS "att_insert" ON attendance;
DROP POLICY IF EXISTS "att_update" ON attendance;
CREATE POLICY "att_select" ON attendance FOR SELECT USING (
  is_team_member(team_id, auth.uid()) OR auth.uid() = user_id
);
CREATE POLICY "att_insert" ON attendance FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "att_update" ON attendance FOR UPDATE USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "ann_select" ON announcements;
DROP POLICY IF EXISTS "ann_insert" ON announcements;
CREATE POLICY "ann_select" ON announcements FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "ann_insert" ON announcements FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "pv_select" ON poll_votes;
DROP POLICY IF EXISTS "pv_insert" ON poll_votes;
CREATE POLICY "pv_select" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "pv_insert" ON poll_votes FOR INSERT WITH CHECK (auth.uid()=user_id);

DROP POLICY IF EXISTS "fin_select" ON financial_obligations;
DROP POLICY IF EXISTS "fin_insert" ON financial_obligations;
CREATE POLICY "fin_select" ON financial_obligations FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "fin_insert" ON financial_obligations FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "pay_select" ON payments;
DROP POLICY IF EXISTS "pay_upsert" ON payments;
DROP POLICY IF EXISTS "pay_update" ON payments;
CREATE POLICY "pay_select" ON payments FOR SELECT USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "pay_upsert" ON payments FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()) OR auth.uid()=user_id);
CREATE POLICY "pay_update" ON payments FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "leaves_select" ON leaves;
DROP POLICY IF EXISTS "leaves_insert" ON leaves;
DROP POLICY IF EXISTS "leaves_update" ON leaves;
CREATE POLICY "leaves_select" ON leaves FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "leaves_insert" ON leaves FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "leaves_update" ON leaves FOR UPDATE USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "notes_select" ON coach_notes;
DROP POLICY IF EXISTS "notes_insert" ON coach_notes;
DROP POLICY IF EXISTS "notes_update" ON coach_notes;
CREATE POLICY "notes_select" ON coach_notes FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "notes_insert" ON coach_notes FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "notes_update" ON coach_notes FOR UPDATE USING (auth.uid()=player_id OR is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "inj_select" ON injuries;
DROP POLICY IF EXISTS "inj_insert" ON injuries;
DROP POLICY IF EXISTS "inj_update" ON injuries;
CREATE POLICY "inj_select" ON injuries FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "inj_insert" ON injuries FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "inj_update" ON injuries FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "pts_select" ON points_transactions;
DROP POLICY IF EXISTS "pts_insert" ON points_transactions;
CREATE POLICY "pts_select" ON points_transactions FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "pts_insert" ON points_transactions FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "aps_select" ON auto_point_settings;
DROP POLICY IF EXISTS "aps_insert" ON auto_point_settings;
DROP POLICY IF EXISTS "aps_update" ON auto_point_settings;
CREATE POLICY "aps_select" ON auto_point_settings FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "aps_insert" ON auto_point_settings FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "aps_update" ON auto_point_settings FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "comp_select" ON competitions;
DROP POLICY IF EXISTS "comp_insert" ON competitions;
CREATE POLICY "comp_select" ON competitions FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "comp_insert" ON competitions FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "dm_select" ON direct_messages;
DROP POLICY IF EXISTS "dm_insert" ON direct_messages;
DROP POLICY IF EXISTS "dm_update" ON direct_messages;
CREATE POLICY "dm_select" ON direct_messages FOR SELECT USING (auth.uid()=sender_id OR auth.uid()=receiver_id);
CREATE POLICY "dm_insert" ON direct_messages FOR INSERT WITH CHECK (auth.uid()=sender_id AND is_team_member(team_id,auth.uid()));
CREATE POLICY "dm_update" ON direct_messages FOR UPDATE USING (auth.uid()=receiver_id);

DROP POLICY IF EXISTS "rpt_select" ON secret_reports;
DROP POLICY IF EXISTS "rpt_insert" ON secret_reports;
CREATE POLICY "rpt_select" ON secret_reports FOR SELECT USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rpt_insert" ON secret_reports FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "chat_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_insert" ON chat_messages;
CREATE POLICY "chat_select" ON chat_messages FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "chat_insert" ON chat_messages FOR INSERT WITH CHECK (auth.uid()=sender_id AND is_team_member(team_id,auth.uid()));

DROP POLICY IF EXISTS "notif_select" ON notifications;
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (auth.uid()=user_id);

DROP POLICY IF EXISTS "inv_select" ON invitations;
DROP POLICY IF EXISTS "inv_insert" ON invitations;
DROP POLICY IF EXISTS "inv_update" ON invitations;
CREATE POLICY "inv_select" ON invitations FOR SELECT USING (
  is_team_admin(team_id, auth.uid()) OR auth.uid() IS NOT NULL
);
CREATE POLICY "inv_insert" ON invitations FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "inv_update" ON invitations FOR UPDATE USING (
  is_team_admin(team_id, auth.uid()) OR auth.uid() IS NOT NULL
);

-- Enable Realtime for chat and notifications (safe re-run via DO block)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE attendance; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- END OF MIGRATION

-- =============================================
-- MATCHES MODULE (Add-on migration)
-- =============================================

-- MATCHES table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  opponent TEXT NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  match_type TEXT DEFAULT 'league' CHECK (match_type IN ('league','cup','friendly','playoff','other')),
  home_away TEXT DEFAULT 'home' CHECK (home_away IN ('home','away','neutral')),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finished','cancelled')),
  -- Result
  goals_for INTEGER,
  goals_against INTEGER,
  -- Stats (JSON arrays of player refs)
  scorers JSONB DEFAULT '[]',
  assisters JSONB DEFAULT '[]',
  yellow_cards JSONB DEFAULT '[]',
  red_cards JSONB DEFAULT '[]',
  -- Notes
  notes TEXT,
  -- Meta
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_team ON matches(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "matches_select" ON matches;
DROP POLICY IF EXISTS "matches_insert" ON matches;
DROP POLICY IF EXISTS "matches_update" ON matches;
DROP POLICY IF EXISTS "matches_delete" ON matches;
CREATE POLICY "matches_select" ON matches FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "matches_insert" ON matches FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "matches_update" ON matches FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "matches_delete" ON matches FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- Add attendance group members column to events (for targeted invites)
ALTER TABLE events ADD COLUMN IF NOT EXISTS att_member_ids UUID[] DEFAULT NULL;

-- END MATCHES MIGRATION

-- =============================================
-- V3 ADDITIONS
-- =============================================

-- TOURNAMENTS
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  season TEXT,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;

-- BEST PLAYER POLLS
CREATE TABLE IF NOT EXISTS best_player_polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
  winner_id UUID REFERENCES profiles(id),
  points_awarded INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS best_player_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES best_player_polls(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nominee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, voter_id)
);

-- PERMISSIONS (per user, per team, per permission key)
CREATE TABLE IF NOT EXISTS team_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id, permission)
);

-- Add position_label to team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS position_label TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_team ON tournaments(team_id);
CREATE INDEX IF NOT EXISTS idx_bpp_event ON best_player_polls(event_id);
CREATE INDEX IF NOT EXISTS idx_bpv_poll ON best_player_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_perms_team_user ON team_permissions(team_id, user_id);

-- RLS
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_player_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_player_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tourn_select" ON tournaments;
DROP POLICY IF EXISTS "tourn_insert" ON tournaments;
DROP POLICY IF EXISTS "tourn_update" ON tournaments;
DROP POLICY IF EXISTS "tourn_delete" ON tournaments;
CREATE POLICY "tourn_select" ON tournaments FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "tourn_insert" ON tournaments FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tourn_update" ON tournaments FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tourn_delete" ON tournaments FOR DELETE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "bpp_select" ON best_player_polls;
DROP POLICY IF EXISTS "bpp_insert" ON best_player_polls;
DROP POLICY IF EXISTS "bpp_update" ON best_player_polls;
CREATE POLICY "bpp_select" ON best_player_polls FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "bpp_insert" ON best_player_polls FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "bpp_update" ON best_player_polls FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

DROP POLICY IF EXISTS "bpv_select" ON best_player_votes;
DROP POLICY IF EXISTS "bpv_insert" ON best_player_votes;
CREATE POLICY "bpv_select" ON best_player_votes FOR SELECT USING (true);
CREATE POLICY "bpv_insert" ON best_player_votes FOR INSERT WITH CHECK (auth.uid()=voter_id);

DROP POLICY IF EXISTS "perms_select" ON team_permissions;
DROP POLICY IF EXISTS "perms_insert" ON team_permissions;
DROP POLICY IF EXISTS "perms_delete" ON team_permissions;
CREATE POLICY "perms_select" ON team_permissions FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "perms_insert" ON team_permissions FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "perms_delete" ON team_permissions FOR DELETE USING (is_team_admin(team_id,auth.uid()));


-- Add sender_name and team_logo to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS team_logo TEXT;

-- =============================================
-- V4: TEAM ARCHIVE & SWITCHER
-- Run this block in Supabase SQL Editor
-- =============================================

-- V4: tm_select, att_select, ev_select updated policies are now consolidated in the base section above

-- =============================================
-- V5: Match details merged into events
-- =============================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS opponent TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS home_away TEXT DEFAULT 'home' CHECK (home_away IN ('home','away','neutral'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_category TEXT DEFAULT 'friendly' CHECK (match_category IN ('friendly','tournament'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS tournament_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS goals_for INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS goals_against INTEGER;

-- =============================================
-- V6: Monthly Star + Report Member Tagging
-- =============================================

-- MONTHLY STARS
CREATE TABLE IF NOT EXISTS monthly_stars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  announced_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_stars_team ON monthly_stars(team_id);

ALTER TABLE monthly_stars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ms_select" ON monthly_stars;
DROP POLICY IF EXISTS "ms_insert" ON monthly_stars;
DROP POLICY IF EXISTS "ms_update" ON monthly_stars;
DROP POLICY IF EXISTS "ms_delete" ON monthly_stars;
CREATE POLICY "ms_select" ON monthly_stars FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "ms_insert" ON monthly_stars FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "ms_update" ON monthly_stars FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "ms_delete" ON monthly_stars FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- Secret reports: tagged members
ALTER TABLE secret_reports ADD COLUMN IF NOT EXISTS tagged_members UUID[] DEFAULT NULL;

-- =============================================
-- V7: Parent role — linked player
-- =============================================
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS linked_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- =============================================
-- V8: Leave team function (SECURITY DEFINER so member can update own row)
-- =============================================
-- Run V8 SQL separately (function above)

-- =============================================
-- V9: Parent chat type on chat_messages
-- =============================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS chat_type TEXT DEFAULT 'general'
  CHECK (chat_type IN ('general', 'parents'));
CREATE INDEX IF NOT EXISTS idx_chat_type ON chat_messages(team_id, chat_type);
CREATE OR REPLACE FUNCTION leave_team(p_team_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE team_members
  SET status = 'inactive', removed_at = NOW()
  WHERE team_id = p_team_id AND user_id = auth.uid() AND role != 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- V10: Regulations (team documents)
-- =============================================
CREATE TABLE IF NOT EXISTS regulations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  published_at DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regulations_team ON regulations(team_id, published_at DESC);
ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reg_select" ON regulations;
DROP POLICY IF EXISTS "reg_insert" ON regulations;
DROP POLICY IF EXISTS "reg_update" ON regulations;
DROP POLICY IF EXISTS "reg_delete" ON regulations;
CREATE POLICY "reg_select" ON regulations FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "reg_insert" ON regulations FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "reg_update" ON regulations FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "reg_delete" ON regulations FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V11: Team Expenses (مصاريف الفريق)
-- =============================================
CREATE TABLE IF NOT EXISTS team_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'أخرى',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_expenses_team ON team_expenses(team_id, expense_date DESC);
ALTER TABLE team_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "texp_select" ON team_expenses;
DROP POLICY IF EXISTS "texp_insert" ON team_expenses;
DROP POLICY IF EXISTS "texp_update" ON team_expenses;
DROP POLICY IF EXISTS "texp_delete" ON team_expenses;
CREATE POLICY "texp_select" ON team_expenses FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "texp_insert" ON team_expenses FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "texp_update" ON team_expenses FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "texp_delete" ON team_expenses FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V12: Medical Reports (التقارير الطبية)
-- =============================================
CREATE TABLE IF NOT EXISTS medical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'injury'
    CHECK (report_type IN ('injury','checkup','followup','other')),
  description TEXT,
  injury_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','monitoring','recovered')),
  attachment_url TEXT,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medical_report_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES medical_reports(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  note TEXT NOT NULL,
  attachment_url TEXT,
  note_type TEXT DEFAULT 'followup'
    CHECK (note_type IN ('comment','followup','prescription','xray','therapy')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_reports_team ON medical_reports(team_id, player_id);
CREATE INDEX IF NOT EXISTS idx_med_notes_report ON medical_report_notes(report_id);

ALTER TABLE medical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_report_notes ENABLE ROW LEVEL SECURITY;

-- Player sees own reports; team admin/doctor sees all
DROP POLICY IF EXISTS "med_select" ON medical_reports;
DROP POLICY IF EXISTS "med_insert" ON medical_reports;
DROP POLICY IF EXISTS "med_update" ON medical_reports;
DROP POLICY IF EXISTS "mednote_select" ON medical_report_notes;
DROP POLICY IF EXISTS "mednote_insert" ON medical_report_notes;
CREATE POLICY "med_select" ON medical_reports FOR SELECT USING (
  auth.uid() = player_id OR is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_reports.team_id AND user_id = auth.uid()
    AND permission IN ('view_medical','manage_medical')
  )
);
CREATE POLICY "med_insert" ON medical_reports FOR INSERT WITH CHECK (
  auth.uid() = player_id OR is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_reports.team_id AND user_id = auth.uid()
    AND permission = 'manage_medical'
  )
);
CREATE POLICY "med_update" ON medical_reports FOR UPDATE USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_reports.team_id AND user_id = auth.uid()
    AND permission = 'manage_medical'
  )
);

CREATE POLICY "mednote_select" ON medical_report_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM medical_reports mr WHERE mr.id = report_id
    AND (mr.player_id = auth.uid() OR is_team_admin(mr.team_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_permissions tp
      WHERE tp.team_id = mr.team_id AND tp.user_id = auth.uid()
      AND tp.permission IN ('view_medical','manage_medical')
    ))
  )
);
CREATE POLICY "mednote_insert" ON medical_report_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id AND EXISTS (
    SELECT 1 FROM medical_reports mr WHERE mr.id = report_id
    AND (is_team_admin(mr.team_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_permissions tp
      WHERE tp.team_id = mr.team_id AND tp.user_id = auth.uid()
      AND tp.permission = 'manage_medical'
    ))
  )
);

-- =============================================
-- STORAGE BUCKETS
-- =============================================

-- medical-files bucket (public — getPublicUrl() requires public=true)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-files', 'medical-files', true,
  20971520,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "med_files_select" ON storage.objects;
DROP POLICY IF EXISTS "med_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "med_files_update" ON storage.objects;
DROP POLICY IF EXISTS "med_files_delete" ON storage.objects;

CREATE POLICY "med_files_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'medical-files' AND auth.uid() IS NOT NULL);
CREATE POLICY "med_files_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'medical-files' AND auth.uid() IS NOT NULL);
CREATE POLICY "med_files_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'medical-files' AND auth.uid() IS NOT NULL);
CREATE POLICY "med_files_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'medical-files' AND auth.uid() IS NOT NULL);

-- =============================================
-- V13: PLATFORM ADMIN DASHBOARD
-- =============================================

-- Add platform admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT FALSE;

-- Helper: check if current user is platform admin
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- RPC: get platform-wide statistics (V15 fixed: event_type, added more KPIs)
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT jsonb_build_object(
    'total_teams',         (SELECT COUNT(*) FROM teams WHERE is_active = TRUE),
    'total_all_teams',     (SELECT COUNT(*) FROM teams),
    'total_users',         (SELECT COUNT(*) FROM profiles),
    'total_members',       (SELECT COUNT(*) FROM team_members WHERE status = 'active' AND removed_at IS NULL),
    'avg_members_per_team',(
      SELECT ROUND(AVG(cnt)::numeric, 1) FROM (
        SELECT team_id, COUNT(*) as cnt FROM team_members
        WHERE status = 'active' AND removed_at IS NULL
        GROUP BY team_id
      ) x
    ),
    'role_breakdown',      (
      SELECT jsonb_object_agg(role, cnt) FROM (
        SELECT role, COUNT(*) as cnt FROM team_members
        WHERE status = 'active' AND removed_at IS NULL
        GROUP BY role ORDER BY cnt DESC
      ) r
    ),
    'age_category_breakdown', (
      SELECT jsonb_object_agg(COALESCE(age_category,'غير محدد'), cnt) FROM (
        SELECT age_category, COUNT(*) as cnt FROM teams
        WHERE is_active = TRUE GROUP BY age_category
      ) a
    ),
    'sport_type_breakdown',(
      SELECT jsonb_object_agg(COALESCE(sport_type,'غير محدد'), cnt) FROM (
        SELECT sport_type, COUNT(*) as cnt FROM teams
        WHERE is_active = TRUE GROUP BY sport_type
      ) s
    ),
    'total_events',        (SELECT COUNT(*) FROM events),
    'total_matches',       (SELECT COUNT(*) FROM matches),
    'total_training',      (SELECT COUNT(*) FROM events WHERE event_type = 'training'),
    'total_messages',      (SELECT COUNT(*) FROM chat_messages),
    'total_announcements', (SELECT COUNT(*) FROM announcements),
    'total_injuries',      (SELECT COUNT(*) FROM medical_reports),
    'active_injuries',     (SELECT COUNT(*) FROM medical_reports WHERE status IN ('active','monitoring')),
    'total_attendance',    (SELECT COUNT(*) FROM attendance),
    'total_points_tx',     (SELECT COUNT(*) FROM points_transactions),
    'total_leaves',        (SELECT COUNT(*) FROM leaves),
    'total_finance',       (SELECT COUNT(*) FROM financial_obligations),
    'total_team_expenses', (SELECT COUNT(*) FROM team_expenses),
    'new_teams_30d',       (SELECT COUNT(*) FROM teams WHERE created_at > NOW() - INTERVAL '30 days'),
    'new_users_30d',       (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days'),
    'new_members_30d',     (SELECT COUNT(*) FROM team_members WHERE joined_at > NOW() - INTERVAL '30 days' AND status = 'active'),
    'users_in_team',       (SELECT COUNT(DISTINCT user_id) FROM team_members WHERE status = 'active' AND removed_at IS NULL),
    'users_no_team',       (
      SELECT COUNT(*) FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.user_id = p.id AND tm.status = 'active' AND tm.removed_at IS NULL
      )
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- RPC: get all teams with stats
CREATE OR REPLACE FUNCTION admin_get_teams(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, name TEXT, sport_type TEXT, age_category TEXT, city TEXT,
  is_active BOOLEAN, created_at TIMESTAMPTZ,
  owner_name TEXT, owner_email TEXT,
  member_count BIGINT, event_count BIGINT, match_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT
    t.id, t.name, t.sport_type, t.age_category, t.city,
    t.is_active, t.created_at,
    p.full_name as owner_name, p.email as owner_email,
    (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND tm.status = 'active' AND tm.removed_at IS NULL) as member_count,
    (SELECT COUNT(*) FROM events e WHERE e.team_id = t.id) as event_count,
    (SELECT COUNT(*) FROM matches m WHERE m.team_id = t.id) as match_count
  FROM teams t
  LEFT JOIN profiles p ON p.id = t.created_by
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- RPC: get all users (platform-wide)
CREATE OR REPLACE FUNCTION admin_get_users(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0, p_search TEXT DEFAULT '')
RETURNS TABLE (
  id UUID, full_name TEXT, email TEXT, phone TEXT,
  avatar_url TEXT, profile_complete BOOLEAN,
  is_platform_admin BOOLEAN, created_at TIMESTAMPTZ,
  team_count BIGINT, roles TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT
    p.id, p.full_name, p.email, p.phone,
    p.avatar_url, p.profile_complete,
    p.is_platform_admin, p.created_at,
    (SELECT COUNT(DISTINCT tm.team_id) FROM team_members tm WHERE tm.user_id = p.id AND tm.status = 'active' AND tm.removed_at IS NULL) as team_count,
    ARRAY(SELECT DISTINCT tm2.role FROM team_members tm2 WHERE tm2.user_id = p.id AND tm2.status = 'active' AND tm2.removed_at IS NULL) as roles
  FROM profiles p
  WHERE p_search = '' OR (
    p.full_name ILIKE '%' || p_search || '%'
    OR p.email ILIKE '%' || p_search || '%'
  )
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- RPC: get team detail (full breakdown)
CREATE OR REPLACE FUNCTION admin_get_team_detail(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT jsonb_build_object(
    'team',    (SELECT row_to_json(t) FROM teams t WHERE t.id = p_team_id),
    'members', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', tm.id, 'role', tm.role, 'status', tm.status,
        'joined_at', tm.joined_at,
        'full_name', p.full_name, 'email', p.email
      ))
      FROM team_members tm
      JOIN profiles p ON p.id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'active' AND tm.removed_at IS NULL
    ),
    'stats', jsonb_build_object(
      'events',    (SELECT COUNT(*) FROM events WHERE team_id = p_team_id),
      'matches',   (SELECT COUNT(*) FROM matches WHERE team_id = p_team_id),
      'trainings', (SELECT COUNT(*) FROM events WHERE team_id = p_team_id AND event_type = 'training'),
      'injuries',  (SELECT COUNT(*) FROM medical_reports WHERE team_id = p_team_id),
      'messages',  (SELECT COUNT(*) FROM chat_messages WHERE team_id = p_team_id),
      'leaves',    (SELECT COUNT(*) FROM leaves WHERE team_id = p_team_id)
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- RPC: platform admin action — toggle team active status
CREATE OR REPLACE FUNCTION admin_toggle_team(p_team_id UUID, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE teams SET is_active = p_active WHERE id = p_team_id;
END;
$$;

-- RPC: platform admin action — set user as admin
CREATE OR REPLACE FUNCTION admin_set_platform_admin(p_user_id UUID, p_value BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET is_platform_admin = p_value WHERE id = p_user_id;
END;
$$;

-- =============================================
-- V14: INVITATION SYSTEM FIX
-- =============================================

-- Fix invitations RLS: allow any logged-in user to read (needed for token lookup)
-- (inv_select and inv_update are now set with the correct policy in the base section above)

-- RPC: look up invite by token (SECURITY DEFINER to bypass RLS safely)
CREATE OR REPLACE FUNCTION get_invite_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',        i.id,
    'team_id',   i.team_id,
    'email',     i.email,
    'role',      i.role,
    'status',    i.status,
    'team_name', t.name,
    'team_logo', t.logo_url,
    'sport_type',t.sport_type
  )
  INTO result
  FROM invitations i
  JOIN teams t ON t.id = i.team_id
  WHERE i.token = p_token AND i.status = 'pending';
  RETURN result;
END;
$$;

-- Fix join_requests: always allow admin to insert on behalf (for re-adding)
-- Already: jr_insert: auth.uid()=user_id  (correct for self-join)
-- Add: allow admins to insert members directly via RPC
CREATE OR REPLACE FUNCTION add_member_direct(p_team_id UUID, p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_team_admin(p_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- Remove old record if exists (re-adding)
  DELETE FROM team_members WHERE team_id = p_team_id AND user_id = p_user_id;
  INSERT INTO team_members(team_id, user_id, role, status, is_visible)
  VALUES(p_team_id, p_user_id, p_role, 'active', true);
END;
$$;

-- =============================================
-- V15: SUBSCRIPTION MANAGEMENT + MEMBER FREEZE
-- =============================================

-- 1. Add subscription columns to teams
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS subscription_fee      numeric(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscriptions_enabled boolean       DEFAULT false;

-- 2. Add freeze columns to team_members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_frozen  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frozen_by  uuid        REFERENCES profiles(id) DEFAULT NULL;

-- 3. member_subscriptions table
CREATE TABLE IF NOT EXISTS member_subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date          date        NOT NULL,
  end_date            date        NOT NULL,
  months              int         NOT NULL DEFAULT 1,
  original_amount     numeric(10,2) NOT NULL,
  discount_type       text        CHECK (discount_type IN ('percent','fixed') OR discount_type IS NULL),
  discount_value      numeric(10,2) DEFAULT 0,
  final_amount        numeric(10,2) NOT NULL,
  notes               text,
  renewed_by          uuid        REFERENCES profiles(id),
  notif_7day_sent     boolean     DEFAULT false,
  notif_1day_sent     boolean     DEFAULT false,
  notif_expired_sent  boolean     DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_select" ON member_subscriptions;
DROP POLICY IF EXISTS "sub_insert" ON member_subscriptions;
DROP POLICY IF EXISTS "sub_update" ON member_subscriptions;

CREATE POLICY "sub_select" ON member_subscriptions FOR SELECT
  USING (is_team_admin(team_id, auth.uid()) OR player_id = auth.uid());

CREATE POLICY "sub_insert" ON member_subscriptions FOR INSERT
  WITH CHECK (is_team_admin(team_id, auth.uid()));

CREATE POLICY "sub_update" ON member_subscriptions FOR UPDATE
  USING (is_team_admin(team_id, auth.uid()));

-- 4. RPC: get latest subscription per active member for a team
CREATE OR REPLACE FUNCTION get_team_subscriptions(p_team_id uuid)
RETURNS TABLE (
  player_id        uuid,
  full_name        text,
  avatar_url       text,
  role             text,
  sub_id           uuid,
  start_date       date,
  end_date         date,
  months           int,
  original_amount  numeric,
  discount_type    text,
  discount_value   numeric,
  final_amount     numeric,
  notes            text,
  days_left        int
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    tm.user_id,
    p.full_name,
    p.avatar_url,
    tm.role,
    ms.id,
    ms.start_date,
    ms.end_date,
    ms.months,
    ms.original_amount,
    ms.discount_type,
    ms.discount_value,
    ms.final_amount,
    ms.notes,
    (ms.end_date - CURRENT_DATE)::int
  FROM team_members tm
  JOIN profiles p ON p.id = tm.user_id
  LEFT JOIN LATERAL (
    SELECT * FROM member_subscriptions s
    WHERE s.player_id = tm.user_id AND s.team_id = p_team_id
    ORDER BY s.end_date DESC LIMIT 1
  ) ms ON true
  WHERE tm.team_id = p_team_id
    AND tm.status = 'active'
  ORDER BY ms.end_date ASC NULLS FIRST;
$$;

-- 5. RPC: check and fire subscription notifications
CREATE OR REPLACE FUNCTION check_subscription_notifications(p_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  -- 7-day warning
  FOR r IN
    SELECT ms.id, ms.player_id, t.name AS team_name, ms.end_date
    FROM member_subscriptions ms
    JOIN teams t ON t.id = ms.team_id
    WHERE ms.team_id = p_team_id
      AND (ms.end_date - CURRENT_DATE) = 7
      AND ms.notif_7day_sent = false
  LOOP
    INSERT INTO notifications(user_id, title, body, type, team_id)
    VALUES(r.player_id,
      'تذكير: اشتراكك سينتهي قريباً',
      'اشتراكك في فريق ' || r.team_name || ' سينتهي بعد 7 أيام بتاريخ ' || r.end_date,
      'subscription', p_team_id);
    UPDATE member_subscriptions SET notif_7day_sent = true WHERE id = r.id;
  END LOOP;

  -- 1-day warning
  FOR r IN
    SELECT ms.id, ms.player_id, t.name AS team_name, ms.end_date
    FROM member_subscriptions ms
    JOIN teams t ON t.id = ms.team_id
    WHERE ms.team_id = p_team_id
      AND (ms.end_date - CURRENT_DATE) = 1
      AND ms.notif_1day_sent = false
  LOOP
    INSERT INTO notifications(user_id, title, body, type, team_id)
    VALUES(r.player_id,
      'تنبيه: اشتراكك ينتهي غداً',
      'اشتراكك في فريق ' || r.team_name || ' ينتهي غداً. تواصل مع المسؤول للتجديد.',
      'subscription', p_team_id);
    UPDATE member_subscriptions SET notif_1day_sent = true WHERE id = r.id;
  END LOOP;

  -- expired
  FOR r IN
    SELECT ms.id, ms.player_id, t.name AS team_name, ms.end_date
    FROM member_subscriptions ms
    JOIN teams t ON t.id = ms.team_id
    WHERE ms.team_id = p_team_id
      AND ms.end_date < CURRENT_DATE
      AND ms.notif_expired_sent = false
  LOOP
    INSERT INTO notifications(user_id, title, body, type, team_id)
    VALUES(r.player_id,
      'انتهى اشتراكك',
      'انتهى اشتراكك في فريق ' || r.team_name || ' بتاريخ ' || r.end_date || '. تواصل مع المسؤول للتجديد.',
      'subscription', p_team_id);
    UPDATE member_subscriptions SET notif_expired_sent = true WHERE id = r.id;
  END LOOP;
END;
$$;

-- 6. RPC: toggle member freeze
CREATE OR REPLACE FUNCTION toggle_member_freeze(p_team_id uuid, p_user_id uuid, p_freeze boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_team_admin(p_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE team_members
  SET
    is_frozen = p_freeze,
    frozen_at = CASE WHEN p_freeze THEN now() ELSE NULL END,
    frozen_by = CASE WHEN p_freeze THEN auth.uid() ELSE NULL END
  WHERE team_id = p_team_id AND user_id = p_user_id;
END;
$$;

-- =============================================
-- V16: SUBSCRIPTION PAYMENT TRACKING + EXPENSE IMAGES
-- =============================================

-- 1. Payment tracking columns on member_subscriptions
ALTER TABLE member_subscriptions
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid'
    CHECK (payment_status IN ('paid','partial','unpaid')),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2) DEFAULT NULL;

UPDATE member_subscriptions
  SET payment_status = COALESCE(payment_status, 'paid'),
      paid_amount    = COALESCE(paid_amount, final_amount)
  WHERE payment_status IS NULL OR paid_amount IS NULL;

-- 2. Receipt images array on team_expenses
ALTER TABLE team_expenses
  ADD COLUMN IF NOT EXISTS receipt_images text[] DEFAULT '{}';

-- 3. RPC: all subscriptions per team (not just latest per player)
CREATE OR REPLACE FUNCTION get_team_subscriptions_all(p_team_id uuid)
RETURNS TABLE (
  player_id       uuid,
  full_name       text,
  avatar_url      text,
  role            text,
  sub_id          uuid,
  start_date      date,
  end_date        date,
  months          int,
  original_amount numeric,
  discount_type   text,
  discount_value  numeric,
  final_amount    numeric,
  paid_amount     numeric,
  payment_status  text,
  notes           text,
  days_left       int,
  created_at      timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    tm.user_id,
    p.full_name,
    p.avatar_url,
    tm.role,
    ms.id,
    ms.start_date,
    ms.end_date,
    ms.months,
    ms.original_amount,
    ms.discount_type,
    ms.discount_value,
    ms.final_amount,
    COALESCE(ms.paid_amount, ms.final_amount),
    COALESCE(ms.payment_status, 'paid'),
    ms.notes,
    (ms.end_date - CURRENT_DATE)::int,
    ms.created_at
  FROM team_members tm
  JOIN profiles p ON p.id = tm.user_id
  JOIN member_subscriptions ms
    ON ms.player_id = tm.user_id AND ms.team_id = p_team_id
  WHERE tm.team_id = p_team_id AND tm.status = 'active'
  ORDER BY tm.user_id, ms.start_date DESC;
$$;


-- ══════════════════════════════════════════════════
-- V16: Announcements target_roles
-- ══════════════════════════════════════════════════
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_roles text[] DEFAULT NULL;

-- =============================================
-- V17: Fixed Expenses (مصاريف ثابتة)
-- =============================================

CREATE TABLE IF NOT EXISTS fixed_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'التزام'
    CHECK (item_type IN ('راتب', 'فاتورة', 'التزام', 'إيجار')),
  name TEXT NOT NULL,
  due_day INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  recurrence_type TEXT NOT NULL DEFAULT 'continuous'
    CHECK (recurrence_type IN ('count', 'continuous')),
  recurrence_count INT DEFAULT NULL,
  default_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_expense_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES fixed_expense_items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  paid_by UUID REFERENCES profiles(id),
  original_amount NUMERIC(10,2),
  edit_reason TEXT,
  edited_by UUID REFERENCES profiles(id),
  edited_at TIMESTAMPTZ,
  edited_by_name TEXT,
  team_expense_id UUID REFERENCES team_expenses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_fixed_items_team ON fixed_expense_items(team_id);
CREATE INDEX IF NOT EXISTS idx_fixed_payments_item ON fixed_expense_payments(item_id);
CREATE INDEX IF NOT EXISTS idx_fixed_payments_team ON fixed_expense_payments(team_id, period_month DESC);

ALTER TABLE fixed_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expense_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fei_select" ON fixed_expense_items;
DROP POLICY IF EXISTS "fei_insert" ON fixed_expense_items;
DROP POLICY IF EXISTS "fei_update" ON fixed_expense_items;
DROP POLICY IF EXISTS "fei_delete" ON fixed_expense_items;
CREATE POLICY "fei_select" ON fixed_expense_items FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "fei_insert" ON fixed_expense_items FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "fei_update" ON fixed_expense_items FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "fei_delete" ON fixed_expense_items FOR DELETE USING (is_team_admin(team_id, auth.uid()));

DROP POLICY IF EXISTS "fep_select" ON fixed_expense_payments;
DROP POLICY IF EXISTS "fep_insert" ON fixed_expense_payments;
DROP POLICY IF EXISTS "fep_update" ON fixed_expense_payments;
DROP POLICY IF EXISTS "fep_delete" ON fixed_expense_payments;
CREATE POLICY "fep_select" ON fixed_expense_payments FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "fep_insert" ON fixed_expense_payments FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "fep_update" ON fixed_expense_payments FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "fep_delete" ON fixed_expense_payments FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V_MATCHES: FULL MATCHES MODULE
-- =============================================

-- Link matches to events (auto-created event when match is added)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- Excuse type for match attendance (injured/suspended/excluded/other)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS excuse_type TEXT
  CHECK (excuse_type IN ('injured','suspended','excluded','other'));

-- Jersey number per team member
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS jersey_number INTEGER;

-- Player positions: one primary position and up to three secondary positions.
-- position_label remains for legacy/custom staff labels.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS primary_position TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] DEFAULT '{}';

-- Season label stored per team for the matches page header
ALTER TABLE teams ADD COLUMN IF NOT EXISTS current_season TEXT;

-- MATCH LINEUP: formation + player assignments
CREATE TABLE IF NOT EXISTS match_lineup (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  formation TEXT NOT NULL DEFAULT '4-4-2',
  players JSONB DEFAULT '[]',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_match ON match_lineup(match_id);

ALTER TABLE match_lineup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lineup_select" ON match_lineup;
DROP POLICY IF EXISTS "lineup_insert" ON match_lineup;
DROP POLICY IF EXISTS "lineup_update" ON match_lineup;
DROP POLICY IF EXISTS "lineup_delete" ON match_lineup;
CREATE POLICY "lineup_select" ON match_lineup FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "lineup_insert" ON match_lineup FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "lineup_update" ON match_lineup FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "lineup_delete" ON match_lineup FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- MATCH EVENTS: goals, cards, substitutions with minute tracking
CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('goal','assist','yellow_card','red_card','substitution','clean_sheet')),
  player_id UUID REFERENCES profiles(id),
  player_out_id UUID REFERENCES profiles(id),
  minute INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mevents_match ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_mevents_team ON match_events(team_id);

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mev_select" ON match_events;
DROP POLICY IF EXISTS "mev_insert" ON match_events;
DROP POLICY IF EXISTS "mev_update" ON match_events;
DROP POLICY IF EXISTS "mev_delete" ON match_events;
CREATE POLICY "mev_select" ON match_events FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "mev_insert" ON match_events FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "mev_update" ON match_events FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "mev_delete" ON match_events FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V_MATCHES_V2: SCHEMA ADDITIONS
-- =============================================

-- Fix: map_url was missing → caused silent match creation failure (event created, match not)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS map_url TEXT;

-- Tournament context per match
ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_number INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS leg TEXT DEFAULT 'none'
  CHECK (leg IN ('home','away','none'));

-- Tournament system type (determines which sub-fields appear in match form)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS system TEXT DEFAULT 'cup'
  CHECK (system IN ('league','groups','cup'));

-- =============================================
-- V_MATCHES_V3: MATCH NOTES
-- =============================================

-- Coach/staff technical notes per match with visibility control
CREATE TABLE IF NOT EXISTS match_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  -- all=everyone, staff=coach+assistant+admin, management=admin only, me=creator only
  visibility TEXT NOT NULL DEFAULT 'staff'
    CHECK (visibility IN ('all','staff','management','me')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mnotes_match ON match_notes(match_id);

ALTER TABLE match_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mnotes_select" ON match_notes;
DROP POLICY IF EXISTS "mnotes_insert" ON match_notes;
DROP POLICY IF EXISTS "mnotes_update" ON match_notes;
DROP POLICY IF EXISTS "mnotes_delete" ON match_notes;
CREATE POLICY "mnotes_select" ON match_notes FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "mnotes_insert" ON match_notes FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "mnotes_update" ON match_notes FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "mnotes_delete" ON match_notes FOR DELETE USING (created_by = auth.uid() OR is_team_admin(team_id, auth.uid()));



-- =============================================
-- V_MATCHES_V4: MATCH ATTENDANCE ENHANCEMENTS
-- =============================================

-- Player's pre-match self-confirmation (default: confirmed)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS player_confirmation TEXT
  CHECK (player_confirmation IN ('confirmed', 'absent', 'uncertain'));

-- Late arrival duration in minutes (coach-recorded)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER;
