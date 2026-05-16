-- ── Attendance Auto-Points: add event_id to points_transactions ────────────
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to run multiple times

-- 1. Add event_id column so auto-points can be tracked per event
ALTER TABLE points_transactions
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pts_event ON points_transactions(event_id);

-- 2. Allow admins/coaches to delete auto-points (needed for reversal on status change)
DROP POLICY IF EXISTS "pts_delete" ON points_transactions;
CREATE POLICY "pts_delete" ON points_transactions FOR DELETE
  USING (is_team_admin(team_id, auth.uid()));

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
