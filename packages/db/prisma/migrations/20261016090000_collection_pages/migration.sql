-- Support stable chronological keyset pages without offsets.
CREATE INDEX "tasks_team_id_created_at_id_idx" ON "tasks" ("team_id", "created_at", "id");
CREATE INDEX "comments_task_id_created_at_id_idx" ON "comments" ("task_id", "created_at", "id");
