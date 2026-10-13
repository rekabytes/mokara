CREATE TABLE "mcp_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "workspace_ids" UUID[] NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mcp_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mcp_connections_name_check" CHECK (char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "mcp_connections_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "mcp_connections_workspaces_check" CHECK (cardinality("workspace_ids") BETWEEN 1 AND 20),
  CONSTRAINT "mcp_connections_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "mcp_connections_token_hash_key" ON "mcp_connections"("token_hash");
CREATE INDEX "mcp_connections_user_id_created_at_idx" ON "mcp_connections"("user_id", "created_at");
