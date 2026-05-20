-- =============================================
-- Medical Cases Migration
-- حالات طبية منظمة - إصابات رياضية وأمراض
-- Run after migration.sql
-- =============================================

-- =============================================
-- medical_cases: الجدول الرئيسي للحالات الطبية
-- =============================================
CREATE TABLE IF NOT EXISTS medical_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Case type
  case_type TEXT NOT NULL DEFAULT 'injury'
    CHECK (case_type IN ('injury', 'illness')),

  -- Injury: context and mechanism
  injury_context TEXT
    CHECK (injury_context IN ('training', 'match', 'personal', 'unknown')),
  injury_mechanism TEXT
    CHECK (injury_mechanism IN ('contact', 'non_contact', 'overuse', 'fatigue', 'unknown')),

  -- Injury: body location
  body_region TEXT,
  body_side TEXT
    CHECK (body_side IN ('right', 'left', 'bilateral', 'central')),
  body_location TEXT,

  -- Injury: tissue and diagnosis
  tissue_type TEXT,
  detailed_diagnosis TEXT,

  -- Illness type (when case_type = 'illness')
  illness_type TEXT,

  -- Severity and status
  severity TEXT NOT NULL DEFAULT 'moderate'
    CHECK (severity IN ('minimal', 'mild', 'moderate', 'severe', 'very_severe')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'monitoring', 'recovered')),

  -- Dates and absence
  onset_date DATE,
  expected_return_date DATE,
  actual_return_date DATE,
  absence_days INTEGER DEFAULT 0,

  -- Recurrence tracking
  is_recurrence BOOLEAN DEFAULT FALSE,
  previous_case_id UUID REFERENCES medical_cases(id),

  -- Medical details
  practitioner_name TEXT,
  imaging_done BOOLEAN DEFAULT FALSE,
  imaging_type TEXT,
  imaging_notes TEXT,
  rehab_plan TEXT,
  notes TEXT,

  -- Attachment
  attachment_url TEXT,

  -- Metadata
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- medical_case_audit_logs: سجل التغييرات
-- =============================================
CREATE TABLE IF NOT EXISTS medical_case_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- medical_case_notes: متابعة ومستجدات الحالات
-- =============================================
CREATE TABLE IF NOT EXISTS medical_case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  note TEXT NOT NULL,
  attachment_url TEXT,
  note_type TEXT DEFAULT 'followup'
    CHECK (note_type IN ('comment', 'followup', 'prescription', 'xray', 'therapy', 'rehab')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_medical_cases_team
  ON medical_cases(team_id, player_id);

CREATE INDEX IF NOT EXISTS idx_medical_cases_status
  ON medical_cases(team_id, status);

CREATE INDEX IF NOT EXISTS idx_medical_cases_recurrence
  ON medical_cases(player_id, body_region, body_side, detailed_diagnosis);

CREATE INDEX IF NOT EXISTS idx_medical_case_audit
  ON medical_case_audit_logs(case_id);

CREATE INDEX IF NOT EXISTS idx_medical_case_notes_case
  ON medical_case_notes(case_id);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE medical_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_case_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_case_notes ENABLE ROW LEVEL SECURITY;

-- ── medical_cases policies ─────────────────
DROP POLICY IF EXISTS "mc_select" ON medical_cases;
DROP POLICY IF EXISTS "mc_insert" ON medical_cases;
DROP POLICY IF EXISTS "mc_update" ON medical_cases;

-- Player sees own cases; team admin/doctor sees all
CREATE POLICY "mc_select" ON medical_cases FOR SELECT USING (
  auth.uid() = player_id
  OR is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_cases.team_id
      AND user_id = auth.uid()
      AND permission IN ('view_medical', 'manage_medical')
  )
);

-- Player can submit own case; admin/doctor can submit for any player
CREATE POLICY "mc_insert" ON medical_cases FOR INSERT WITH CHECK (
  auth.uid() = player_id
  OR is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_cases.team_id
      AND user_id = auth.uid()
      AND permission = 'manage_medical'
  )
);

-- Only admin/doctor can update
CREATE POLICY "mc_update" ON medical_cases FOR UPDATE USING (
  is_team_admin(team_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM team_permissions
    WHERE team_id = medical_cases.team_id
      AND user_id = auth.uid()
      AND permission = 'manage_medical'
  )
);

-- ── audit log policies ────────────────────
DROP POLICY IF EXISTS "mc_audit_select" ON medical_case_audit_logs;
DROP POLICY IF EXISTS "mc_audit_insert" ON medical_case_audit_logs;

CREATE POLICY "mc_audit_select" ON medical_case_audit_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM medical_cases mc WHERE mc.id = case_id
    AND (
      is_team_admin(mc.team_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM team_permissions tp
        WHERE tp.team_id = mc.team_id AND tp.user_id = auth.uid()
        AND tp.permission IN ('view_medical', 'manage_medical')
      )
    )
  )
);

CREATE POLICY "mc_audit_insert" ON medical_case_audit_logs FOR INSERT WITH CHECK (
  auth.uid() = changed_by
);

-- ── case notes policies ──────────────────
DROP POLICY IF EXISTS "mc_notes_select" ON medical_case_notes;
DROP POLICY IF EXISTS "mc_notes_insert" ON medical_case_notes;

-- Player sees notes on own cases; admin/doctor sees all
CREATE POLICY "mc_notes_select" ON medical_case_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM medical_cases mc WHERE mc.id = case_id
    AND (
      mc.player_id = auth.uid()
      OR is_team_admin(mc.team_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM team_permissions tp
        WHERE tp.team_id = mc.team_id AND tp.user_id = auth.uid()
        AND tp.permission IN ('view_medical', 'manage_medical')
      )
    )
  )
);

CREATE POLICY "mc_notes_insert" ON medical_case_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM medical_cases mc WHERE mc.id = case_id
    AND (
      is_team_admin(mc.team_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM team_permissions tp
        WHERE tp.team_id = mc.team_id AND tp.user_id = auth.uid()
        AND tp.permission = 'manage_medical'
      )
    )
  )
);
