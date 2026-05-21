-- =============================================
-- Training Block Authors Patch
-- Run after training_migration.sql
-- =============================================
-- Tracks who wrote content in each block column

ALTER TABLE training_session_blocks
  ADD COLUMN IF NOT EXISTS authored_hc  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authored_fc  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authored_gkt UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authored_hc_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authored_fc_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authored_gkt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tsb_authored_hc  ON training_session_blocks(authored_hc)  WHERE authored_hc  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tsb_authored_fc  ON training_session_blocks(authored_fc)  WHERE authored_fc  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tsb_authored_gkt ON training_session_blocks(authored_gkt) WHERE authored_gkt IS NOT NULL;

NOTIFY pgrst, 'reload schema';
