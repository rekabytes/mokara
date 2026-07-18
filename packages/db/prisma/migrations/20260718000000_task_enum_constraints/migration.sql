-- Enforce allowed enum values for tasks.status and tasks.priority.
-- Mirrors the server-side validation in handlers.go (createTeamTask, updateTask).

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_status_check"
  CHECK (status IN ('todo', 'in_progress', 'done'));

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_priority_check"
  CHECK (priority IN ('low', 'medium', 'high'));
