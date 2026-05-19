-- Add preferred_foot column to team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS preferred_foot text CHECK (preferred_foot IN ('يمين', 'يسار'));
