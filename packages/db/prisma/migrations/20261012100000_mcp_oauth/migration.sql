CREATE TABLE "mcp_oauth_clients" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL CHECK (char_length("name") BETWEEN 1 AND 80),
  "redirect_uris" TEXT[] NOT NULL CHECK (cardinality("redirect_uris") BETWEEN 1 AND 10),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "mcp_connections" ALTER COLUMN "token_hash" DROP NOT NULL;
ALTER TABLE "mcp_connections" ADD COLUMN "client_id" UUID REFERENCES "mcp_oauth_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mcp_connections" ADD COLUMN "resource" TEXT;
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_credential_kind_check" CHECK (
  ("client_id" IS NULL AND "token_hash" IS NOT NULL AND "resource" IS NULL) OR
  ("client_id" IS NOT NULL AND "token_hash" IS NULL AND "resource" IS NOT NULL)
);
CREATE TABLE "mcp_oauth_codes" (
  "code_hash" TEXT PRIMARY KEY CHECK ("code_hash" ~ '^[a-f0-9]{64}$'),
  "connection_id" UUID NOT NULL REFERENCES "mcp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "redirect_uri" TEXT NOT NULL,
  "challenge" TEXT NOT NULL CHECK ("challenge" ~ '^[A-Za-z0-9_-]{43}$'),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3)
);
CREATE INDEX "mcp_oauth_codes_connection_id_idx" ON "mcp_oauth_codes"("connection_id");
CREATE TABLE "mcp_oauth_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL REFERENCES "mcp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "access_hash" TEXT NOT NULL UNIQUE CHECK ("access_hash" ~ '^[a-f0-9]{64}$'),
  "refresh_hash" TEXT NOT NULL UNIQUE CHECK ("refresh_hash" ~ '^[a-f0-9]{64}$'),
  "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "refresh_used_at" TIMESTAMPTZ(3),
  CHECK ("refresh_expires_at" >= "access_expires_at")
);
CREATE INDEX "mcp_oauth_tokens_connection_id_idx" ON "mcp_oauth_tokens"("connection_id");
