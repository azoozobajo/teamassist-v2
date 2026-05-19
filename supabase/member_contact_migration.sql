-- Add admin-only contact fields to team_members
-- (player phone/email are in profiles table, entered by the player themselves)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS guardian_name  text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS home_address   text;
