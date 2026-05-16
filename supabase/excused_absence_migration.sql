-- ── Step 1: Add 'excused' absence status ─────────────────────────────────────
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to run multiple times

-- Drop old check constraint (try common auto-generated names)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check1;

-- Add new constraint that includes 'excused'
DO $$ BEGIN
  ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
    CHECK (status IN ('present','absent','uncertain','late','excused'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add excuse_reason column (stores the reason text entered by coach)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS excuse_reason TEXT;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
