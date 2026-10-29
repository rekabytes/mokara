import type { Context } from "hono";
import { MCP_SCOPES } from "./permissions.ts";
import { mcpOAuthConfig } from "./oauth-config.ts";
import { log } from "../lib/logger.ts";

export class McpFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
    readonly retryAfter?: number,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

// One HTTP error adapter for credential management and agent transport.
// Unexpected database errors may contain credential values: never dump them.
export function handleMcpHttpError(error: Error, c: Context) {
  c.header("Cache-Control", "no-store");
  if (error instanceof McpFailure) {
    if (error.status === 401) {
      const config = mcpOAuthConfig();
      c.header(
        "WWW-Authenticate",
        config
          ? `Bearer resource_metadata="${config.metadata}", scope="${MCP_SCOPES.join(" ")}"`
          : 'Bearer realm="mokara-mcp"'
      );
    }
    if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
    return c.json(
      {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      error.status
    );
  }
  log.error("mcp request failed");
  return c.json({ error: "internal_error", message: "Agent access is unavailable." }, 500);
}
