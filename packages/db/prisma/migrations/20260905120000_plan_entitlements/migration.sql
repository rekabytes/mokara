-- PRD-11 Phase 1.1: subscription plans. The tier lives on the USER (one
-- checkout per account, §6.6) and a workspace's tier is its leader's plan.
-- Nothing writes this column during Phase 1 — Phase 2 billing webhooks do —
-- so every account reads 'free' and the enforced caps are the free caps.
ALTER TABLE "users" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';

-- Plain TEXT + CHECK, not a Postgres enum: matches how tasks.status/priority
-- are constrained in this schema (users_plan_check).
ALTER TABLE "users"
  ADD CONSTRAINT "users_plan_check"
  CHECK ("plan" IN ('free', 'starter', 'pro', 'ultra'));

-- The 3-member cap can no longer live in Postgres: a trigger cannot see the
-- leader's plan. Enforcement moves to lib/entitlements.ts, which now checks
-- BOTH paths the trigger guarded (invite creation AND acceptance) — the
-- accept check is the race-safe one the trigger used to be.
DROP TRIGGER enforce_max_team_members_trigger ON "team_members";
DROP FUNCTION enforce_max_team_members();
