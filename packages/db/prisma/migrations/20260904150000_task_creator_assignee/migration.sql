-- PRD-10: task ownership + assignment. The creator (owner) is immutable and
-- null for tasks predating the column; the assignee is mutable and must be a
-- member of the task's team (route-enforced). Users deleting (future account
-- deletion) nulls both — the task stays.
ALTER TABLE "tasks" ADD COLUMN "creator_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "assignee_id" UUID;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");
