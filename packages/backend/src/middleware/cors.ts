import type { Context, Next } from "hono";
import { isAllowedMcpOrigin } from "../mcp/origin.ts";
import { env } from "../env.ts";

import { allowedBrowserOrigin, originlessMachinePath } from "../lib/browser-origin.ts";

export async function corsMiddleware(c: Context, next: Next) {
  if (c.req.path === "/api/mcp" || c.req.path === "/api/mcp/") {
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Origin");
    const origin = c.req.header("Origin");
    if (!isAllowedMcpOrigin(origin, env.MCP_ALLOWED_ORIGINS))
      return c.json({ error: "mcp_origin_forbidden", message: "Origin is not allowed." }, 403);
    if (origin) c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version");
    c.header("Access-Control-Expose-Headers", "WWW-Authenticate, Retry-After");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
    return;
  }
  if (
    c.req.path.startsWith("/.well-known/oauth-") ||
    /^\/api\/mcp\/oauth\/(register|token|revoke)$/.test(c.req.path)
  ) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Expose-Headers", "Retry-After");
    c.header("Cache-Control", "no-store");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
    return;
  }
  const origin = c.req.header("Origin");
  const trusted = allowedBrowserOrigin(origin, env);
  const safe = ["GET", "HEAD", "OPTIONS"].includes(c.req.method);
  c.header("Vary", "Origin");

  // CORS alone cannot stop a simple form POST from reaching a handler. Enforce
  // the same trust boundary before parsing bodies or performing cookie mutations.
  if (
    (origin !== undefined && !trusted) ||
    (!safe && !trusted && !originlessMachinePath(c.req.path))
  ) {
    c.header("Cache-Control", "no-store");
    return c.json(
      { error: "origin_forbidden", message: "Start this request from a trusted Mokara site." },
      403
    );
  }
  if (trusted && origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Expose-Headers", "Retry-After, X-Mokara-Next-Cursor");
    c.header("Access-Control-Max-Age", "86400");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
}
