-- PRD-13 (owner, 2026-09-09): the first-run spotlight tour's "have they been
-- through it?" flag. One nullable column carries the whole question.
--
--   NULL        never resolved -> the tour runs. That is a brand-new account,
--               an account created before this migration, and anyone who closed
--               the tab mid-tour (they never finished, so it starts again).
--   'completed' reached the last step and pressed Finish -> never again.
--   'skipped'   pressed Skip, the close button or Esc      -> never again.
--
-- Server-side rather than device storage for the same reason as
-- last_container_id: the cookie policy promises one session cookie and no
-- localStorage, and a server flag follows the user across devices. It also
-- means a phone-first user still gets the tour on their first desktop visit —
-- the tour does not run below the 800px breakpoint, where its sidebar targets
-- do not exist, and that visit leaves this column NULL.
--
-- tour_resolved_at is bookkeeping only: nothing reads it to decide visibility.
-- It exists so a skip can be told from a completion in time, which is the only
-- way drop-off could ever be measured.
--
-- NULL for every existing row, so there is no backfill and no behaviour change
-- on deploy except that every current user sees the tour once (PRD-13 §7.6 —
-- the owner's stated rule: fresh account or anything, show it).
ALTER TABLE "users" ADD COLUMN "tour_state" TEXT;
ALTER TABLE "users" ADD COLUMN "tour_resolved_at" TIMESTAMPTZ(3);

-- Same posture as users_plan_check and users_plan_override_check: the value
-- looks like an enum, so the database constrains it. NULL is the normal case
-- and must stay legal.
ALTER TABLE "users"
  ADD CONSTRAINT "users_tour_state_check"
  CHECK ("tour_state" IS NULL OR "tour_state" IN ('completed', 'skipped'));
