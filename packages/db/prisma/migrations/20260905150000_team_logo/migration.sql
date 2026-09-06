-- PRD-11 Phase 1.4: a per-workspace logo — the visible Starter perk. Stored as
-- three columns rather than an attachments row because it is not a task file:
-- it has no uploader-visible history, one object per workspace (overwritten),
-- and it hangs off the container, not a task. logo_bytes exists so the storage
-- quota can honestly include it (PRD-11 §7 1.4).
ALTER TABLE "teams" ADD COLUMN "logo_key" TEXT;
ALTER TABLE "teams" ADD COLUMN "logo_bytes" INTEGER;
ALTER TABLE "teams" ADD COLUMN "logo_type" TEXT;
