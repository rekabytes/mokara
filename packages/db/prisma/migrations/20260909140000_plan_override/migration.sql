-- Operator grants get their own column.
--
-- `users.plan` gained a second writer with the operator console: Stripe writes it
-- (lib/billing.ts, via webhook or sync) and an operator writes it
-- (routes/admin.ts). One column cannot hold both facts, and the collision was
-- destructive — sync reconciles a customer with no live subscription back to
-- 'free', so a grant was wiped the next time that user opened /settings. Worse,
-- merely STARTING a checkout persists a Stripe customer (routes/billing.ts), so
-- "customer with zero subscriptions" is a common state, not a rare one.
--
-- From here: `plan` stays exactly what Stripe says, and `plan_override` is an
-- operator grant that wins at read time (effectivePlan in lib/plans.ts). Two
-- writers, two columns, no reconciliation between them.
--
-- NULL for every existing row, so this migration changes no behaviour on deploy
-- and needs no backfill. A real paid subscription retires a grant: applying a
-- subscription that resolves to a known tier clears this column, so money stays
-- the source of truth for anyone actually paying.

ALTER TABLE "users" ADD COLUMN "plan_override" TEXT;

-- Same posture as users_plan_check: the value looks like an enum, so the database
-- constrains it. NULL (no grant) is the normal case and must stay legal.
ALTER TABLE "users"
  ADD CONSTRAINT "users_plan_override_check"
  CHECK ("plan_override" IS NULL OR "plan_override" IN ('free', 'starter', 'pro', 'ultra'));
