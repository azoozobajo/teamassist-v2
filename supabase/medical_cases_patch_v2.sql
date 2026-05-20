-- =============================================
-- Medical Cases Patch v2
-- Run after medical_cases_migration.sql
-- =============================================

-- ── Allow players to add notes (comment type) on their own cases ──────
DROP POLICY IF EXISTS "mc_notes_insert" ON medical_case_notes;

CREATE POLICY "mc_notes_insert" ON medical_case_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM medical_cases mc WHERE mc.id = case_id
    AND (
      mc.player_id = auth.uid()
      OR is_team_admin(mc.team_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM team_permissions tp
        WHERE tp.team_id = mc.team_id AND tp.user_id = auth.uid()
        AND tp.permission = 'manage_medical'
      )
    )
  )
);

-- ── Allow admin/doctor to delete cases ───────────────────────────────
DROP POLICY IF EXISTS "mc_delete" ON medical_cases;

CREATE POLICY "mc_delete" ON medical_cases FOR DELETE USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_cases.team_id
      AND user_id = auth.uid()
      AND permission = 'manage_medical'
  )
);
