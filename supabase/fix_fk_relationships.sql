-- Fix FK relationships for PostgREST embedding
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to run multiple times

-- coach_notes: add FK constraints so PostgREST can embed profile data
DO $$ BEGIN
  ALTER TABLE coach_notes ADD CONSTRAINT coach_notes_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE coach_notes ADD CONSTRAINT coach_notes_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- internal_mail: add FK constraints for sender and receiver
DO $$ BEGIN
  ALTER TABLE internal_mail ADD CONSTRAINT internal_mail_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE internal_mail ADD CONSTRAINT internal_mail_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reload PostgREST schema cache so changes take effect immediately
NOTIFY pgrst, 'reload schema';
