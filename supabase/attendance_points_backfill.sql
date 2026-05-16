-- ── Retroactive Attendance Points Backfill ───────────────────────────────────
-- Run AFTER attendance_autopoints_migration.sql (event_id column must exist first)
-- Run in: Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- Safe to run multiple times — skips events that already have auto-points

WITH trigger_map(event_type, trigger_label) AS (
  VALUES
    ('training', 'حضور التدريب'),
    ('match',    'حضور المباراة'),
    ('meeting',  'حضور الاجتماع'),
    ('camp',     'حضور المعسكر')
),
missing AS (
  SELECT
    a.team_id,
    a.user_id,
    a.event_id,
    aps.points,
    tm.trigger_label AS reason,
    e.start_datetime AS created_at
  FROM attendance a
  JOIN events e           ON e.id          = a.event_id
  JOIN trigger_map tm     ON tm.event_type = e.event_type
  JOIN auto_point_settings aps
    ON  aps.team_id       = a.team_id
    AND aps.event_trigger = tm.trigger_label
    AND aps.is_active     = true
    AND aps.points        > 0
  WHERE a.status IN ('present', 'late')
    AND NOT EXISTS (
      SELECT 1 FROM points_transactions pt
      WHERE  pt.event_id = a.event_id
        AND  pt.user_id  = a.user_id
        AND  pt.is_auto  = true
    )
)
INSERT INTO points_transactions
  (team_id, user_id, event_id, points, category, reason, is_auto, created_at)
SELECT
  team_id, user_id, event_id, points,
  'حضور', reason, true, COALESCE(created_at, NOW())
FROM missing;

-- Show how many rows were inserted
SELECT COUNT(*) AS rows_backfilled FROM points_transactions WHERE is_auto = true AND event_id IS NOT NULL;
