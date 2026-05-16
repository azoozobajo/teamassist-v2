-- coach_notes: full setup with RLS policies
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to run multiple times (all statements are idempotent)

-- 1. Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS coach_notes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id            UUID        NOT NULL,
  coach_id             UUID        NOT NULL,
  note_type            TEXT        NOT NULL DEFAULT 'توجيه',
  content              TEXT        NOT NULL,
  event_title          TEXT,
  is_read              BOOLEAN     NOT NULL DEFAULT FALSE,
  is_visible_to_player BOOLEAN     NOT NULL DEFAULT FALSE,
  player_reply         TEXT,
  player_replied_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add missing columns to existing tables (safe on fresh tables too)
ALTER TABLE coach_notes ADD COLUMN IF NOT EXISTS player_reply         TEXT;
ALTER TABLE coach_notes ADD COLUMN IF NOT EXISTS player_replied_at   TIMESTAMPTZ;
ALTER TABLE coach_notes ADD COLUMN IF NOT EXISTS is_visible_to_player BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Enable RLS
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;

-- 4. Drop old policies cleanly before recreating
DROP POLICY IF EXISTS "coach_notes_coach_insert"             ON coach_notes;
DROP POLICY IF EXISTS "coach_notes_coach_select"             ON coach_notes;
DROP POLICY IF EXISTS "coach_notes_player_select"            ON coach_notes;
DROP POLICY IF EXISTS "coach_notes_player_update"            ON coach_notes;
DROP POLICY IF EXISTS "coach_notes_coach_update"             ON coach_notes;
DROP POLICY IF EXISTS "Coaches can insert their own notes"   ON coach_notes;
DROP POLICY IF EXISTS "Coaches can read their own notes"     ON coach_notes;
DROP POLICY IF EXISTS "Players can read their own notes"     ON coach_notes;
DROP POLICY IF EXISTS "Players can reply to their notes"     ON coach_notes;
DROP POLICY IF EXISTS "Admins can read all team notes"       ON coach_notes;
DROP POLICY IF EXISTS "Players can update their own notes"   ON coach_notes;
DROP POLICY IF EXISTS "Coaches can update their own notes"   ON coach_notes;

-- 5. INSERT: owner, coach, or admin active in the team can create notes
CREATE POLICY "coach_notes_coach_insert" ON coach_notes
  FOR INSERT WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = coach_notes.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status  = 'active'
        AND team_members.role IN ('owner', 'coach', 'admin', 'medical')
    )
  );

-- 6. SELECT for coaches/admins: see notes they wrote
CREATE POLICY "coach_notes_coach_select" ON coach_notes
  FOR SELECT USING ( coach_id = auth.uid() );

-- 7. SELECT for players: see only notes marked visible to them
CREATE POLICY "coach_notes_player_select" ON coach_notes
  FOR SELECT USING (
    player_id = auth.uid()
    AND is_visible_to_player = TRUE
  );

-- 8. UPDATE for players: can mark as read and add their reply
CREATE POLICY "coach_notes_player_update" ON coach_notes
  FOR UPDATE USING  ( player_id = auth.uid() )
  WITH CHECK        ( player_id = auth.uid() );

-- 9. UPDATE for coaches: can update notes they wrote
CREATE POLICY "coach_notes_coach_update" ON coach_notes
  FOR UPDATE USING  ( coach_id = auth.uid() )
  WITH CHECK        ( coach_id = auth.uid() );
