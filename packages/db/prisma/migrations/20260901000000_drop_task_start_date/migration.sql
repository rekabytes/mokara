-- AlterTable
-- Start dates are no longer user-entered: the moment work starts is the
-- first todo -> in_progress transition in task_events, so the column is dead.
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "start_date";
