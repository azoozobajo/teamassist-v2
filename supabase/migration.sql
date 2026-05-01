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
  INSERT INTO profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
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
