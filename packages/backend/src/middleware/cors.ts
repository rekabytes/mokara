import type { Context, Next } from "hono";
import { env } from "../env.ts";

// Parses CORS_ALLOWED_ORIGINS into either:
//   - { mode: "open" }      — no allow-list configured (echo any origin or "*")
//   - { mode: "wildcard" }  — explicitly "*"
//   - { mode: "list", list } — specific allow-list
type Allowed = { mode: "open" } | { mode: "wildcard" } | { mode: "list"; list: string[] };

function parseAllowedOrigins(raw: string): Allowed {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return { mode: "open" };
  if (parts.length === 1 && parts[0] === "*") return { mode: "wildcard" };
  return { mode: "list", list: parts };
}

// Mirrors the Go `corsMiddleware`: when credentials are used (the cookie-based
// auth), the response Access-Control-Allow-Origin MUST be a single explicit
// value — never "*" — so we echo the request Origin whenever one is present.
export async function corsMiddleware(c: Context, next: Next) {
  const allowed = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const origin = c.req.header("Origin") ?? "";

  if (allowed.mode === "open" || allowed.mode === "wildcard") {
    if (origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
    } else {
      c.header("Access-Control-Allow-Origin", "*");
    }
  } else {
    if (origin && allowed.list.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
    }
    // else: no header set — browser will block the request.
  }

  c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Max-Age", "86400");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
}
