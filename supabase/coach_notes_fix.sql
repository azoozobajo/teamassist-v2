-- Fix coach_notes: add missing player reply columns
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run

ALTER TABLE coach_notes
  ADD COLUMN IF NOT EXISTS player_reply TEXT,
  ADD COLUMN IF NOT EXISTS player_replied_at TIMESTAMPTZ;
