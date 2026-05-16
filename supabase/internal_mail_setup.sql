-- internal_mail: full inbox system for all team members
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run

CREATE TABLE IF NOT EXISTS internal_mail (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL,
  receiver_id   UUID        NOT NULL,
  parent_id     UUID        REFERENCES internal_mail(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  attachment_url TEXT,
  is_read       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_starred    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_mail_receiver ON internal_mail(team_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_internal_mail_sender   ON internal_mail(team_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_internal_mail_parent   ON internal_mail(parent_id);

ALTER TABLE internal_mail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_select"          ON internal_mail;
DROP POLICY IF EXISTS "mail_insert"          ON internal_mail;
DROP POLICY IF EXISTS "mail_receiver_update" ON internal_mail;

-- Anyone who is sender or receiver can read the message
CREATE POLICY "mail_select" ON internal_mail
  FOR SELECT USING ( sender_id = auth.uid() OR receiver_id = auth.uid() );

-- Only active team members can send
CREATE POLICY "mail_insert" ON internal_mail
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = internal_mail.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status  = 'active'
    )
  );

-- Only the receiver can mark as read / star
CREATE POLICY "mail_receiver_update" ON internal_mail
  FOR UPDATE
  USING  ( receiver_id = auth.uid() )
  WITH CHECK ( receiver_id = auth.uid() );
