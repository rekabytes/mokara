-- Backfill (PRD-04 phase 1): seed task_events for tasks that existed
-- before the activity log existed. Best-effort:
--   * every existing task gets a creation event at its created_at
--   * tasks currently 'done' get a synthetic done transition at updated_at
-- Historical actors are credited to the team owner (no per-task author
-- exists). Safe to run repeatedly — each INSERT is a unique row.
-- Cancellation history pre-migration is unknowable; nothing to do.

-- Creation event for every existing task
INSERT INTO task_events (id, team_id, task_id, actor_id, from_status, to_status, created_at)
SELECT
  gen_random_uuid(),
  t.team_id,
  t.id,
  (SELECT owner_id FROM teams WHERE teams.id = t.team_id),
  NULL,
  'todo',
  t.created_at
FROM tasks t;

-- Synthetic done transition for tasks currently done (best-guess)
INSERT INTO task_events (id, team_id, task_id, actor_id, from_status, to_status, created_at)
SELECT
  gen_random_uuid(),
  t.team_id,
  t.id,
  (SELECT owner_id FROM teams WHERE teams.id = t.team_id),
  'todo',
  'done',
  t.updated_at
FROM tasks t
WHERE t.status = 'done';
