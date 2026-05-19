-- Migration: Create absences table for TeamAssist
-- Run this in Supabase SQL editor (Dashboard → SQL Editor)
-- Do NOT run automatically

CREATE TABLE IF NOT EXISTS absences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id),
  absence_type  TEXT NOT NULL DEFAULT 'other',
  -- excused | unexcused | disciplinary | admin_suspension
  -- yellow_cards | red_card | national_team | injury
  -- emergency | academic | family | other
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  reason        TEXT,
  notes         TEXT,
  attachment_url TEXT,
  apply_to      TEXT NOT NULL DEFAULT 'all',
  -- match_only | training_only | meeting_only | all
  -- match_training | training_meeting | match_training_meeting | specific
  specific_event_ids UUID[] DEFAULT '{}',
  recorded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- All active team members can read their team's absences
CREATE POLICY "absences_select"
  ON absences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = absences.team_id
        AND tm.user_id = auth.uid()
        AND tm.status  = 'active'
    )
  );

-- Only admins/coaches can insert
CREATE POLICY "absences_insert"
  ON absences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = absences.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
        AND tm.status  = 'active'
    )
  );

-- Only admins/coaches can delete
CREATE POLICY "absences_delete"
  ON absences FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = absences.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
        AND tm.status  = 'active'
    )
  );
