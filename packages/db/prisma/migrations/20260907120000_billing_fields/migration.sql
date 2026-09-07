-- PRD-11 Phase 2 (owner, 2026-09-07): Stripe billing linkage on the user.
-- `plan` already exists from Phase 1.1; these three columns carry the
-- processor object id and the lifecycle timestamps the webhook maintains.
-- All nullable on purpose: a free — or self-hosted, or never-paying — account
-- has no customer, no period, no grace. TEXT for the customer id: Stripe ids
-- are prefixed strings, not uuids, and we never join on them.
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "users" ADD COLUMN "grace_until" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "period_end" TIMESTAMPTZ(3);
