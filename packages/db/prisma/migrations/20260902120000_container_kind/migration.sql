-- AlterTable
-- PRD-06: one container model, two states. "workspace" = private/solo,
-- "team" = shared. New containers default to team; signup creates workspaces.
ALTER TABLE "teams" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'team';

-- Backfill: a container with exactly one member is a private workspace.
UPDATE "teams" t
SET "kind" = 'workspace'
WHERE (SELECT COUNT(*) FROM "team_members" tm WHERE tm.team_id = t.id) = 1;
