-- The `canceled` status (PRD-04) was added to Zod/Prisma/UI but the original
-- tasks_status CHECK from 20260718000000 was never widened, so PATCHing a
-- task to canceled was rejected by Postgres and surfaced as a 500.

ALTER TABLE "tasks" DROP CONSTRAINT "tasks_status_check";

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_status_check"
  CHECK ("status" IN ('todo', 'in_progress', 'done', 'canceled'));
