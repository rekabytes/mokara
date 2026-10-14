-- Existing grants remain unchanged; new scopes require explicit consent.
ALTER TABLE "mcp_connections" DROP CONSTRAINT "mcp_connections_scopes_check";
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_scopes_check" CHECK (cardinality(scopes) BETWEEN 1 AND 6 AND scopes @> ARRAY['mokara:read'] AND scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github','mokara:drive:read','mokara:drive:upload']);
ALTER TABLE "mcp_oauth_tokens" DROP CONSTRAINT "mcp_oauth_tokens_scopes_check";
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_scopes_check" CHECK (cardinality(scopes) BETWEEN 1 AND 6 AND scopes @> ARRAY['mokara:read'] AND scopes <@ ARRAY['mokara:read','mokara:write','mokara:delete','mokara:github','mokara:drive:read','mokara:drive:upload']);
