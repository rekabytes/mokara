-- Per-user GitHub App connections. Credentials remain ephemeral; these tables
-- store only verified GitHub identities, installation/repository coordinates,
-- and durable task-to-issue links.

CREATE TABLE "github_account_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "github_user_id" BIGINT NOT NULL,
  "github_login" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_account_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_account_connections_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "github_account_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "github_account_connections_user_id_key"
  ON "github_account_connections"("user_id");

CREATE TABLE "github_installations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "github_installation_id" BIGINT NOT NULL,
  "account_id" BIGINT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_verified_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_installations_account_type_check" CHECK ("account_type" IN ('User', 'Organization')),
  CONSTRAINT "github_installations_status_check" CHECK ("status" IN ('active', 'suspended', 'removed'))
);

CREATE UNIQUE INDEX "github_installations_github_installation_id_key"
  ON "github_installations"("github_installation_id");

CREATE TABLE "github_account_installations" (
  "connection_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_account_installations_pkey" PRIMARY KEY ("connection_id", "installation_id"),
  CONSTRAINT "github_account_installations_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "github_account_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "github_account_installations_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "github_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "github_account_installations_installation_id_idx"
  ON "github_account_installations"("installation_id");

CREATE TABLE "github_repositories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "installation_id" UUID NOT NULL,
  "github_repository_id" BIGINT NOT NULL,
  "owner_login" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "private" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_verified_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_repositories_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "github_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "github_repositories_github_repository_id_key"
  ON "github_repositories"("github_repository_id");
CREATE UNIQUE INDEX "github_repositories_installation_id_github_repository_id_key"
  ON "github_repositories"("installation_id", "github_repository_id");
CREATE INDEX "github_repositories_installation_id_active_idx"
  ON "github_repositories"("installation_id", "active");

-- Per-user repository access is narrower than installation access for shared
-- organization installations. This join prevents one connected member from
-- inheriting every repository selected for another member.
CREATE TABLE "github_account_repositories" (
  "connection_id" UUID NOT NULL,
  "repository_id" UUID NOT NULL,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_account_repositories_pkey" PRIMARY KEY ("connection_id", "repository_id"),
  CONSTRAINT "github_account_repositories_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "github_account_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "github_account_repositories_repository_id_fkey"
    FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "github_account_repositories_repository_id_idx"
  ON "github_account_repositories"("repository_id");

CREATE TABLE "github_issue_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "repository_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "connection_id" UUID,
  "github_issue_id" BIGINT,
  "issue_number" INTEGER,
  "issue_url" TEXT,
  "repository_full_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'creating',
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "last_error_code" TEXT,
  "last_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "github_issue_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_issue_links_status_check" CHECK ("status" IN ('creating', 'linked', 'failed')),
  CONSTRAINT "github_issue_links_attempt_count_check" CHECK ("attempt_count" > 0),
  CONSTRAINT "github_issue_links_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "github_issue_links_repository_id_fkey"
    FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "github_issue_links_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "github_issue_links_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "github_account_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "github_issue_links_task_id_key" ON "github_issue_links"("task_id");
CREATE INDEX "github_issue_links_repository_id_idx" ON "github_issue_links"("repository_id");
CREATE INDEX "github_issue_links_created_by_user_id_idx" ON "github_issue_links"("created_by_user_id");
