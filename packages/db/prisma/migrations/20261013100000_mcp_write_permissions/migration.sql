ALTER TABLE "mcp_connections" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['mokara:read'];
ALTER TABLE "mcp_connections" ADD COLUMN "repository_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_scopes_check" CHECK (cardinality(scopes) BETWEEN 1 AND 4 AND scopes @> ARRAY['mokara:read'] AND scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github']);
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_repositories_check" CHECK (cardinality(repository_ids) <= 20 AND (cardinality(repository_ids) = 0 OR scopes @> ARRAY['mokara:github']));
ALTER TABLE "mcp_oauth_tokens" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['mokara:read'];
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_scopes_check" CHECK (cardinality(scopes) BETWEEN 1 AND 4 AND scopes @> ARRAY['mokara:read'] AND scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github']);
CREATE TABLE "mcp_operations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL REFERENCES "mcp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  "result" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "mcp_operations_connection_id_request_id_key" UNIQUE("connection_id","request_id")
);
CREATE INDEX "mcp_operations_user_id_created_at_idx" ON "mcp_operations"("user_id","created_at");

-- A synchronized GitHub issue must have a single task owner. NULL pending
-- references remain available; existing issue creation produces distinct IDs.
CREATE UNIQUE INDEX "github_issue_links_repository_issue_linked_key" ON "github_issue_links"("repository_id", "github_issue_id") WHERE "status" = 'linked' AND "github_issue_id" IS NOT NULL;
