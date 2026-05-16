-- Add is_visible_to_player column to coach_notes
-- Run AFTER coach_notes_setup.sql
ALTER TABLE coach_notes
  ADD COLUMN IF NOT EXISTS is_visible_to_player BOOLEAN NOT NULL DEFAULT FALSE;
