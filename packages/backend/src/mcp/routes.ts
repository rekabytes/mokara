import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { env } from "../env.ts";
import { handleMcpHttpError } from "./errors.ts";
import { authenticateAgent } from "./access.ts";
import { createMcpServer } from "./server.ts";
import { isAllowedMcpOrigin } from "./origin.ts";

export const mcpRoutes = new Hono();
mcpRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!isAllowedMcpOrigin(c.req.header("Origin"), env.MCP_ALLOWED_ORIGINS))
    return c.json({ error: "mcp_origin_forbidden", message: "Origin is not allowed." }, 403);
  await next();
});
mcpRoutes.onError(handleMcpHttpError);
mcpRoutes.all("/", async (c) => {
  const principal = await authenticateAgent(c.req.header("Authorization"));
  if (c.req.method !== "POST") {
    c.header("Allow", "POST");
    return c.json(
      { error: "method_not_allowed", message: "This stateless endpoint accepts POST only." },
      405
    );
  }
  const server = createMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    return c.newResponse(response.body, response);
  } finally {
    await server.close();
  }
});
