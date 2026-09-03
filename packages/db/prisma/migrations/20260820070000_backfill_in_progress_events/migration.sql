-- Backfill v2 (PRD-04 fix): the first backfill synthesized creation and
-- done transitions but missed in_progress. Tasks that were already
-- in_progress when the activity log shipped (or moved there before the
-- PATCH event writer existed) had no transition event, so the in_progress
-- series rendered flat at zero. Synthesize todo -> in_progress at
-- updated_at, same best-effort rule as the done backfill.

INSERT INTO task_events (id, team_id, task_id, actor_id, from_status, to_status, created_at)
SELECT
  gen_random_uuid(),
  t.team_id,
  t.id,
  (SELECT owner_id FROM teams WHERE teams.id = t.team_id),
  'todo',
  'in_progress',
  t.updated_at
FROM tasks t
WHERE t.status = 'in_progress';
