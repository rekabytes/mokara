import { Hono } from "hono";
import {
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { requireOAuthConfig } from "./oauth-config.ts";
import { MCP_SCOPE } from "./oauth-config.ts";
import { handleMcpOAuthError } from "./oauth-errors.ts";
export const mcpOAuthMetadata = new Hono();
mcpOAuthMetadata.onError(handleMcpOAuthError);
mcpOAuthMetadata.get("/oauth-authorization-server", (c) => {
  const { origin } = requireOAuthConfig();
  return c.json(
    OAuthMetadataSchema.parse({
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`,
      registration_endpoint: `${origin}/api/mcp/oauth/register`,
      revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [MCP_SCOPE],
    })
  );
});
for (const path of ["/oauth-protected-resource", "/oauth-protected-resource/api/mcp"])
  mcpOAuthMetadata.get(path, (c) => {
    const { origin, resource } = requireOAuthConfig();
    return c.json(
      OAuthProtectedResourceMetadataSchema.parse({
        resource,
        authorization_servers: [origin],
        scopes_supported: [MCP_SCOPE],
        bearer_methods_supported: ["header"],
        resource_name: "Mokara MCP",
      })
    );
  });
