-- ── Rewards table ────────────────────────────────────────────────────────────
-- A reward is a positive financial credit granted to a team member.
-- From the club's perspective it is an expense; from the member's it is a credit.

CREATE TABLE IF NOT EXISTS rewards (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID           NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  user_id     UUID           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT           NOT NULL,
  notes       TEXT,
  amount      NUMERIC(10,2)  NOT NULL DEFAULT 0,
  created_by  UUID           REFERENCES profiles(id),
  created_at  TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_team ON rewards(team_id);
CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards(team_id, user_id);

-- Row-level security
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rewards_read"      ON rewards;
DROP POLICY IF EXISTS "rewards_admin_all" ON rewards;

-- Any team member can read rewards
CREATE POLICY "rewards_read" ON rewards
  FOR SELECT USING (is_team_member(team_id, auth.uid()));

-- Only admins can insert / update / delete
CREATE POLICY "rewards_admin_insert" ON rewards
  FOR INSERT WITH CHECK (is_team_admin(team_id, auth.uid()));

CREATE POLICY "rewards_admin_delete" ON rewards
  FOR DELETE USING (is_team_admin(team_id, auth.uid()));

NOTIFY pgrst, 'reload schema';
