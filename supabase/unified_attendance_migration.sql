-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Unified Attendance System
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. حقول جديدة على جدول attendance ─────────────────────────────────────

-- نوع الغياب (يحدد السبب الدقيق)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  absence_type TEXT;
-- القيم: unexcused | leave | national_team | admin_suspension |
--        emergency | academic | family | injury | cards | other

-- مصدر الغياب (الجدول الذي نشأ منه هذا السجل)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  source_type TEXT;
-- القيم: manual | player_self | leave | admin_leave |
--        absence | medical | tournament_suspension

-- رقم سجل المصدر (للربط وإمكانية الحذف التتالي)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  source_id UUID;

-- هل أكّده المدرب
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  is_coach_confirmed BOOLEAN DEFAULT FALSE;

-- من أكّده
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  confirmed_by UUID REFERENCES profiles(id);

-- locked_by_source: يمنع المدرب من تحويل عذر رسمي إلى بدون عذر
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
  locked_by_source BOOLEAN DEFAULT FALSE;

-- ── 2. إزالة قيد status القديم وإضافة الجديد (بدون uncertain) ─────────────
-- نبقي uncertain مقبولاً في DB للبيانات القديمة، لا نحذفه
-- الواجهة هي التي تخفيه

-- ── 3. جدول قوانين إيقاف البطولة ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id             UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_id                   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  yellow_cards_limit        INT  NOT NULL DEFAULT 3,
  yellow_suspension_matches INT  NOT NULL DEFAULT 1,
  double_yellow_suspension  INT  NOT NULL DEFAULT 1,
  direct_red_suspension     INT  NOT NULL DEFAULT 2,
  created_by                UUID REFERENCES profiles(id),
  created_at                TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, team_id)
);

-- RLS لـ tournament_rules
ALTER TABLE tournament_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_rules_select" ON tournament_rules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_rules.team_id
      AND tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "tournament_rules_insert" ON tournament_rules FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_rules.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

CREATE POLICY "tournament_rules_update" ON tournament_rules FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_rules.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

CREATE POLICY "tournament_rules_delete" ON tournament_rules FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_rules.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

-- ── 4. جدول إيقافات البطولة الفعلية ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_suspensions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID REFERENCES competitions(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES profiles(id),
  reason           TEXT NOT NULL,
  -- yellow_accumulation | double_yellow | direct_red | custom
  suspension_type  TEXT NOT NULL DEFAULT 'matches',
  -- 'matches' = يُحدَّد بعدد المباريات
  -- 'dates'   = يُحدَّد بنطاق تاريخي
  matches_count    INT,
  matches_served   INT NOT NULL DEFAULT 0,
  from_date        DATE,
  to_date          DATE,
  is_completed     BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- RLS لـ tournament_suspensions
ALTER TABLE tournament_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "t_susp_select" ON tournament_suspensions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_suspensions.team_id
      AND tm.user_id = auth.uid() AND tm.status = 'active'
  ));

CREATE POLICY "t_susp_insert" ON tournament_suspensions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_suspensions.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

CREATE POLICY "t_susp_update" ON tournament_suspensions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_suspensions.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

CREATE POLICY "t_susp_delete" ON tournament_suspensions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = tournament_suspensions.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','head_coach','assistant_coach','administrator')
      AND tm.status = 'active'
  ));

-- ── 5. Indexes للأداء ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_source ON attendance(source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_absence_type ON attendance(team_id, absence_type)
  WHERE absence_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_t_susp_player ON tournament_suspensions(team_id, player_id, is_completed);
CREATE INDEX IF NOT EXISTS idx_t_rules_tournament ON tournament_rules(tournament_id);

-- ── 6. Backfill: uncertain القديم يُعامَل كـ absent في الحسابات ──────────
-- لا نحذف البيانات القديمة، الخدمة الجديدة تعاملها كـ absent في الحساب

-- ── 7. إعادة تحميل schema ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
