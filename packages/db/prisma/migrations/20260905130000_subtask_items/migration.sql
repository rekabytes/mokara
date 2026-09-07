-- PRD-11 Phase 1.2: checklists inside a task. Flat items, not child tasks
-- (recursion, per-item assignment and per-item due dates stay out — the shape
-- was decided in the PRD, don't re-decide it here). `position` is the order
-- the client drew the list in; reordering rewrites it in one transaction.
CREATE TABLE "subtask_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtask_items_pkey" PRIMARY KEY ("id")
);

-- A task's checklist is read whole and ordered, and dies with the task.
CREATE INDEX "subtask_items_task_id_position_idx" ON "subtask_items"("task_id", "position");

ALTER TABLE "subtask_items" ADD CONSTRAINT "subtask_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
