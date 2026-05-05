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
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid()=id);
CREATE POLICY "teams_select" ON teams FOR SELECT USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT WITH CHECK (auth.uid()=created_by);
CREATE POLICY "teams_update" ON teams FOR UPDATE USING (is_team_admin(id,auth.uid()));
CREATE POLICY "tm_select" ON team_members FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "tm_insert" ON team_members FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()) OR auth.uid()=user_id);
CREATE POLICY "tm_update" ON team_members FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tm_delete" ON team_members FOR DELETE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "jr_select" ON join_requests FOR SELECT USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "jr_insert" ON join_requests FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "jr_update" ON join_requests FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rg_select" ON recurrence_groups FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "rg_insert" ON recurrence_groups FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rg_update" ON recurrence_groups FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rg_delete" ON recurrence_groups FOR DELETE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "ev_select" ON events FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "ev_insert" ON events FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "ev_update" ON events FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "ev_delete" ON events FOR DELETE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "att_select" ON attendance FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "att_insert" ON attendance FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "att_update" ON attendance FOR UPDATE USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "ann_select" ON announcements FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "ann_insert" ON announcements FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "pv_select" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "pv_insert" ON poll_votes FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "fin_select" ON financial_obligations FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "fin_insert" ON financial_obligations FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "pay_select" ON payments FOR SELECT USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "pay_upsert" ON payments FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()) OR auth.uid()=user_id);
CREATE POLICY "pay_update" ON payments FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "leaves_select" ON leaves FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "leaves_insert" ON leaves FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "leaves_update" ON leaves FOR UPDATE USING (auth.uid()=user_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "notes_select" ON coach_notes FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "notes_insert" ON coach_notes FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "notes_update" ON coach_notes FOR UPDATE USING (auth.uid()=player_id OR is_team_admin(team_id,auth.uid()));
CREATE POLICY "inj_select" ON injuries FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "inj_insert" ON injuries FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "inj_update" ON injuries FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "pts_select" ON points_transactions FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "pts_insert" ON points_transactions FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "aps_select" ON auto_point_settings FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "aps_insert" ON auto_point_settings FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "aps_update" ON auto_point_settings FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "comp_select" ON competitions FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "comp_insert" ON competitions FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "dm_select" ON direct_messages FOR SELECT USING (auth.uid()=sender_id OR auth.uid()=receiver_id);
CREATE POLICY "dm_insert" ON direct_messages FOR INSERT WITH CHECK (auth.uid()=sender_id AND is_team_member(team_id,auth.uid()));
CREATE POLICY "dm_update" ON direct_messages FOR UPDATE USING (auth.uid()=receiver_id);
CREATE POLICY "rpt_select" ON secret_reports FOR SELECT USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "rpt_insert" ON secret_reports FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "chat_select" ON chat_messages FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "chat_insert" ON chat_messages FOR INSERT WITH CHECK (auth.uid()=sender_id AND is_team_member(team_id,auth.uid()));
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "inv_select" ON invitations FOR SELECT USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "inv_insert" ON invitations FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));

-- Enable Realtime for chat and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;

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

CREATE POLICY "tourn_select" ON tournaments FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "tourn_insert" ON tournaments FOR INSERT WITH CHECK (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tourn_update" ON tournaments FOR UPDATE USING (is_team_admin(team_id,auth.uid()));
CREATE POLICY "tourn_delete" ON tournaments FOR DELETE USING (is_team_admin(team_id,auth.uid()));

CREATE POLICY "bpp_select" ON best_player_polls FOR SELECT USING (is_team_member(team_id,auth.uid()));
CREATE POLICY "bpp_insert" ON best_player_polls FOR INSERT WITH CHECK (is_team_member(team_id,auth.uid()));
CREATE POLICY "bpp_update" ON best_player_polls FOR UPDATE USING (is_team_admin(team_id,auth.uid()));

CREATE POLICY "bpv_select" ON best_player_votes FOR SELECT USING (true);
CREATE POLICY "bpv_insert" ON best_player_votes FOR INSERT WITH CHECK (auth.uid()=voter_id);

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

-- Allow users to see their OWN team_members rows even after removal
DROP POLICY IF EXISTS "tm_select" ON team_members;
CREATE POLICY "tm_select" ON team_members FOR SELECT USING (
  is_team_member(team_id, auth.uid()) OR auth.uid() = user_id
);

-- Allow players to see their OWN attendance records even after team removal (for archived stats)
DROP POLICY IF EXISTS "att_select" ON attendance;
CREATE POLICY "att_select" ON attendance FOR SELECT USING (
  is_team_member(team_id, auth.uid()) OR auth.uid() = user_id
);

-- Allow players to see events they attended (so attendance join works for archived teams)
DROP POLICY IF EXISTS "ev_select" ON events;
CREATE POLICY "ev_select" ON events FOR SELECT USING (
  is_team_member(team_id, auth.uid())
  OR EXISTS (SELECT 1 FROM attendance WHERE event_id = id AND user_id = auth.uid())
);

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
CREATE POLICY "reg_select" ON regulations FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "reg_insert" ON regulations FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "reg_update" ON regulations FOR UPDATE USING (is_team_admin(team_id, auth.uid()));
CREATE POLICY "reg_delete" ON regulations FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V11: Occasions (calendar markers)
-- =============================================
CREATE TABLE IF NOT EXISTS occasions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_occasions_team ON occasions(team_id, from_date);
ALTER TABLE occasions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "occ_select" ON occasions FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "occ_insert" ON occasions FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));
CREATE POLICY "occ_delete" ON occasions FOR DELETE USING (is_team_admin(team_id, auth.uid()));

-- =============================================
-- V12: Regulation required-agreement system
-- =============================================
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS regulation_agreements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  regulation_id UUID REFERENCES regulations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  agreed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(regulation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reg_agreements_reg ON regulation_agreements(regulation_id);
CREATE INDEX IF NOT EXISTS idx_reg_agreements_user ON regulation_agreements(team_id, user_id);
ALTER TABLE regulation_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ra_select" ON regulation_agreements FOR SELECT USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "ra_insert" ON regulation_agreements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ra_upsert" ON regulation_agreements FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- V13: Monthly star improvements
-- =============================================
ALTER TABLE monthly_stars ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE monthly_stars ADD COLUMN IF NOT EXISTS announce_at TIMESTAMPTZ;
ALTER TABLE monthly_stars ADD COLUMN IF NOT EXISTS congrats_msg TEXT;

-- =============================================
-- V14: Monthly star points award
-- =============================================
ALTER TABLE monthly_stars ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;

-- =============================================
-- V15: Best player poll 48-hour auto-close
-- =============================================
ALTER TABLE best_player_polls ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
-- Allow any team member to update poll status (needed for auto-close trigger)
DROP POLICY IF EXISTS "bpp_update" ON best_player_polls;
CREATE POLICY "bpp_update" ON best_player_polls FOR UPDATE USING (is_team_member(team_id, auth.uid()));

-- =============================================
-- V16: Best player multi-vote support
-- =============================================
-- (run separately)

-- =============================================
-- V17: Auto attendance points deduplication
-- =============================================
ALTER TABLE points_transactions ADD COLUMN IF NOT EXISTS source_event_id UUID REFERENCES events(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pts_auto_event_unique
  ON points_transactions(team_id, user_id, source_event_id)
  WHERE is_auto = true AND source_event_id IS NOT NULL;

-- =============================================
-- V16 (continued): Best player multi-vote support
-- =============================================
-- Allow multiple votes per voter (one per nominee) — drop old single-vote constraint
ALTER TABLE best_player_votes DROP CONSTRAINT IF EXISTS best_player_votes_poll_id_voter_id_key;
ALTER TABLE best_player_votes ADD CONSTRAINT IF NOT EXISTS bpv_poll_voter_nominee_unique UNIQUE(poll_id, voter_id, nominee_id);

-- Team-level max votes per voter setting (1, 2, or 3)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS best_player_max_votes INTEGER DEFAULT 1;

-- =============================================
-- V18: Player Levels, Streaks & Badges
-- =============================================

-- Player Levels (admin-configurable tiers with icons)
CREATE TABLE IF NOT EXISTS player_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⭐',
  min_points INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#1D9E75',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Streak Rules (consecutive training attendance → bonus points)
CREATE TABLE IF NOT EXISTS streak_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  consecutive_count INTEGER NOT NULL,
  bonus_points INTEGER NOT NULL,
  UNIQUE(team_id, consecutive_count)
);

-- Player Streaks (current state per player)
CREATE TABLE IF NOT EXISTS player_streaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_training_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  UNIQUE(team_id, user_id)
);

-- Badge Definitions (admin-configurable achievements)
CREATE TABLE IF NOT EXISTS badge_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏅',
  description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('total_points','streak','best_player_wins','monthly_star','match_count','training_count')),
  trigger_value INTEGER NOT NULL DEFAULT 1,
  color TEXT DEFAULT '#F59E0B',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Badges (earned — one per player per badge)
CREATE TABLE IF NOT EXISTS player_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id, badge_id)
);

-- RLS
ALTER TABLE player_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_member_read_levels" ON player_levels;
CREATE POLICY "team_member_read_levels" ON player_levels FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = player_levels.team_id AND user_id = auth.uid() AND status = 'active')
);
DROP POLICY IF EXISTS "admin_manage_levels" ON player_levels;
CREATE POLICY "admin_manage_levels" ON player_levels FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = player_levels.team_id AND user_id = auth.uid() AND role IN ('owner','administrator') AND status = 'active')
);
DROP POLICY IF EXISTS "team_member_read_streak_rules" ON streak_rules;
CREATE POLICY "team_member_read_streak_rules" ON streak_rules FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = streak_rules.team_id AND user_id = auth.uid() AND status = 'active')
);
DROP POLICY IF EXISTS "admin_manage_streak_rules" ON streak_rules;
CREATE POLICY "admin_manage_streak_rules" ON streak_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = streak_rules.team_id AND user_id = auth.uid() AND role IN ('owner','administrator') AND status = 'active')
);
DROP POLICY IF EXISTS "team_member_read_streaks" ON player_streaks;
CREATE POLICY "team_member_read_streaks" ON player_streaks FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = player_streaks.team_id AND user_id = auth.uid() AND status = 'active')
);
DROP POLICY IF EXISTS "self_read_streak" ON player_streaks;
CREATE POLICY "self_read_streak" ON player_streaks FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "service_manage_streaks" ON player_streaks;
CREATE POLICY "service_manage_streaks" ON player_streaks FOR ALL USING (true);
DROP POLICY IF EXISTS "team_member_read_badges" ON badge_definitions;
CREATE POLICY "team_member_read_badges" ON badge_definitions FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = badge_definitions.team_id AND user_id = auth.uid() AND status = 'active')
);
DROP POLICY IF EXISTS "admin_manage_badge_defs" ON badge_definitions;
CREATE POLICY "admin_manage_badge_defs" ON badge_definitions FOR ALL USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = badge_definitions.team_id AND user_id = auth.uid() AND role IN ('owner','administrator') AND status = 'active')
);
DROP POLICY IF EXISTS "team_member_read_player_badges" ON player_badges;
CREATE POLICY "team_member_read_player_badges" ON player_badges FOR SELECT USING (
  EXISTS (SELECT 1 FROM team_members WHERE team_id = player_badges.team_id AND user_id = auth.uid() AND status = 'active')
);
DROP POLICY IF EXISTS "service_manage_player_badges" ON player_badges;
CREATE POLICY "service_manage_player_badges" ON player_badges FOR ALL USING (true);

-- =============================================
-- V19: Best Player voting fixes + result announcement
-- =============================================

-- Fix: allow voters to delete their own votes (removeVote was silently failing)
DROP POLICY IF EXISTS "bpv_delete" ON best_player_votes;
CREATE POLICY "bpv_delete" ON best_player_votes FOR DELETE USING (auth.uid() = voter_id);

-- Track whether poll results were publicly announced
ALTER TABLE best_player_polls ADD COLUMN IF NOT EXISTS result_announced BOOLEAN DEFAULT FALSE;
ALTER TABLE best_player_polls ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;

-- =============================================
-- Fix: payments UPDATE policy — add WITH CHECK so admins can update any payment row
-- =============================================
DROP POLICY IF EXISTS "pay_update" ON payments;
CREATE POLICY "pay_update" ON payments
  FOR UPDATE
  USING     (is_team_admin(team_id, auth.uid()))
  WITH CHECK (is_team_admin(team_id, auth.uid()));

-- Fix: payments INSERT policy — ensure admin can always insert regardless of user_id
DROP POLICY IF EXISTS "pay_upsert" ON payments;
CREATE POLICY "pay_upsert" ON payments
  FOR INSERT
  WITH CHECK (is_team_admin(team_id, auth.uid()) OR auth.uid() = user_id);

-- =============================================
-- RPC: record_payment — bypasses RLS entirely (SECURITY DEFINER)
-- =============================================
CREATE OR REPLACE FUNCTION record_payment(
  p_obligation_id UUID,
  p_user_id       UUID,
  p_team_id       UUID,
  p_paid_amount   NUMERIC,
  p_amount        NUMERIC,
  p_recorded_by   UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_id     UUID;
BEGIN
  IF NOT is_team_admin(p_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  v_status := CASE
    WHEN p_paid_amount >= p_amount THEN 'paid'
    WHEN p_paid_amount  > 0        THEN 'partial'
    ELSE 'unpaid'
  END;

  SELECT id INTO v_id FROM payments
    WHERE obligation_id = p_obligation_id AND user_id = p_user_id;

  IF v_id IS NOT NULL THEN
    UPDATE payments SET
      paid_amount = p_paid_amount, amount = p_amount,
      status = v_status, paid_at = NOW(), recorded_by = p_recorded_by
    WHERE id = v_id;
  ELSE
    INSERT INTO payments
      (obligation_id, user_id, team_id, paid_amount, amount, status, paid_at, recorded_by)
    VALUES
      (p_obligation_id, p_user_id, p_team_id, p_paid_amount, p_amount, v_status, NOW(), p_recorded_by);
  END IF;
END;
$$;
