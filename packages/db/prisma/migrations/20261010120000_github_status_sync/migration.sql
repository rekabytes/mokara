-- Activation is personal, not shared across an organization's installation.
-- Existing access stays visible; users explicitly select up to three repos.
ALTER TABLE "github_account_repositories" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "github_issue_links"
  ADD COLUMN "sync_status" TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN "sync_error_code" TEXT,
  ADD COLUMN "issue_state" TEXT,
  ADD COLUMN "last_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "github_updated_at" TIMESTAMPTZ(3),
  ADD COLUMN "local_status_at" TIMESTAMPTZ(3),
  ADD COLUMN "sync_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "desired_state" TEXT,
  ADD CONSTRAINT "github_issue_links_desired_state_check"
    CHECK ("desired_state" IS NULL OR "desired_state" IN ('open', 'closed')),
  ADD CONSTRAINT "github_issue_links_sync_status_check"
    CHECK ("sync_status" IN ('idle', 'pending', 'synced', 'paused', 'failed')),
  ADD CONSTRAINT "github_issue_links_issue_state_check"
    CHECK ("issue_state" IS NULL OR "issue_state" IN ('open', 'closed'));
CREATE INDEX "github_issue_links_repository_id_github_issue_id_idx"
  ON "github_issue_links" ("repository_id", "github_issue_id");

CREATE TABLE "github_pull_request_links" (
  "issue_link_id" UUID NOT NULL,
  "pull_request_id" BIGINT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_pull_request_links_pkey" PRIMARY KEY ("issue_link_id", "pull_request_id"),
  CONSTRAINT "github_pull_request_links_issue_link_id_fkey"
    FOREIGN KEY ("issue_link_id") REFERENCES "github_issue_links"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "github_pull_request_links_pull_request_id_idx" ON "github_pull_request_links"("pull_request_id");

CREATE TABLE "github_sync_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "delivery_id" TEXT,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until" TIMESTAMPTZ(3),
  "lease_token" UUID,
  "completed_at" TIMESTAMPTZ(3),
  "last_error_code" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_sync_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_sync_jobs_kind_check" CHECK ("kind" IN ('webhook', 'task')),
  CONSTRAINT "github_sync_jobs_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "github_sync_jobs_delivery_id_key" ON "github_sync_jobs"("delivery_id");
CREATE INDEX "github_sync_jobs_completed_at_available_at_idx" ON "github_sync_jobs"("completed_at", "available_at");

-- GitHub actors aren't necessarily Mokara users. Don't misattribute webhook
-- transitions to the person who originally connected the repository.
ALTER TABLE "task_events" ALTER COLUMN "actor_id" DROP NOT NULL;
ALTER TABLE "task_events"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'mokara',
  ADD COLUMN "github_login" TEXT,
  ADD CONSTRAINT "task_events_source_check" CHECK ("source" IN ('mokara', 'github'));
