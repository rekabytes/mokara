-- PRD-06 amendment: KPIs are individual-only — no team scope. Every KPI is
-- owned by its creator; team-level measurement lives in projects.
DROP INDEX IF EXISTS "kpis_team_id_scope_idx";

ALTER TABLE "kpis" DROP COLUMN IF EXISTS "scope";

CREATE INDEX "kpis_team_id_idx" ON "kpis"("team_id");
