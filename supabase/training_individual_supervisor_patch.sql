-- =============================================
-- Training Individual Assignments — Supervisor
-- Run after training_migration.sql
-- =============================================

ALTER TABLE training_individual_assignments
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tia_supervisor ON training_individual_assignments(supervisor_id) WHERE supervisor_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
