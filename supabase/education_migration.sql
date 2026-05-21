-- =============================================
-- Education Events Migration
-- التعليم والتطوير كنوع موعد رسمي
-- Run after migration.sql
-- =============================================

-- ── Allow education as an event type ─────────────────────────────────
DO $$
BEGIN
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
  ALTER TABLE events ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN ('training','match','meeting','camp','other','assessment','education'));
END $$;

-- ── education_events: extra metadata for education events ────────────
CREATE TABLE IF NOT EXISTS education_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  presenter_name TEXT,
  presenter_names TEXT[] DEFAULT '{}',
  source_template_id UUID,
  provider_type TEXT NOT NULL DEFAULT 'club'
    CHECK (provider_type IN ('club','external')),
  provider_name TEXT,
  education_type TEXT NOT NULL DEFAULT 'lecture'
    CHECK (education_type IN ('lecture','course','workshop','training','awareness','meeting','quiz','other')),
  education_category TEXT NOT NULL DEFAULT 'professional'
    CHECK (education_category IN ('psychological','medical','media','discipline','nutrition','tactical','legal','professional','social','other')),
  location_detail TEXT,
  online_url TEXT,
  content_text TEXT,
  content_url TEXT,
  content_notes TEXT,
  description TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE education_events ADD COLUMN IF NOT EXISTS presenter_names TEXT[] DEFAULT '{}';
ALTER TABLE education_events ADD COLUMN IF NOT EXISTS source_template_id UUID;
ALTER TABLE education_events ADD COLUMN IF NOT EXISTS content_text TEXT;
ALTER TABLE education_events ADD COLUMN IF NOT EXISTS content_url TEXT;
ALTER TABLE education_events ADD COLUMN IF NOT EXISTS content_notes TEXT;

-- ── education_course_templates: reusable education templates ─────────
CREATE TABLE IF NOT EXISTS education_course_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'club'
    CHECK (provider_type IN ('club','external')),
  provider_name TEXT,
  presenter_names TEXT[] DEFAULT '{}',
  education_type TEXT NOT NULL DEFAULT 'lecture'
    CHECK (education_type IN ('lecture','course','workshop','training','awareness','meeting','quiz','other')),
  education_category TEXT NOT NULL DEFAULT 'professional'
    CHECK (education_category IN ('psychological','medical','media','discipline','nutrition','tactical','legal','professional','social','other')),
  location_detail TEXT,
  online_url TEXT,
  content_text TEXT,
  content_url TEXT,
  content_notes TEXT,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_education_events_team ON education_events(team_id);
CREATE INDEX IF NOT EXISTS idx_education_events_event ON education_events(event_id);
CREATE INDEX IF NOT EXISTS idx_education_templates_team ON education_course_templates(team_id);

ALTER TABLE education_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_course_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "education_events_select" ON education_events;
DROP POLICY IF EXISTS "education_events_insert" ON education_events;
DROP POLICY IF EXISTS "education_events_update" ON education_events;
DROP POLICY IF EXISTS "education_events_delete" ON education_events;
DROP POLICY IF EXISTS "education_templates_select" ON education_course_templates;
DROP POLICY IF EXISTS "education_templates_insert" ON education_course_templates;
DROP POLICY IF EXISTS "education_templates_update" ON education_course_templates;
DROP POLICY IF EXISTS "education_templates_delete" ON education_course_templates;

CREATE POLICY "education_events_select" ON education_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_events.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "education_events_insert" ON education_events FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_events.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

CREATE POLICY "education_events_update" ON education_events FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_events.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

CREATE POLICY "education_events_delete" ON education_events FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_events.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

CREATE POLICY "education_templates_select" ON education_course_templates FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_course_templates.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "education_templates_insert" ON education_course_templates FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_course_templates.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

CREATE POLICY "education_templates_update" ON education_course_templates FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_course_templates.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

CREATE POLICY "education_templates_delete" ON education_course_templates FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = education_course_templates.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','administrator','head_coach','assistant_coach','medical')
  )
);

NOTIFY pgrst, 'reload schema';
