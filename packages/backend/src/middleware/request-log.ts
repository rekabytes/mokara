import type { Context, Next } from "hono";
import { log } from "../lib/logger.ts";
import { recordOperationalRequest } from "../lib/operational-metrics.ts";
import type { Vars } from "./auth.ts";

// Per-request logger. Skips /health so the probe doesn't flood the terminal.
//
//   [GET]   /api/teams → 200 (4ms) · alice
//   [PATCH] /api/tasks/9f2 → 403 (2ms) · alice · forbidden "not a member of this team"
//
// Failures carry the API's own `{ error, message }` payload so the terminal
// explains WHY, not just that something broke. The body is cloned before
// reading, so the client still gets the real response.
type Ctx = Context<{ Variables: Vars }>;

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const METHOD_COLOR: Record<string, string> = {
  GET: "\x1b[36m", // cyan
  POST: "\x1b[32m", // green
  PUT: "\x1b[33m", // yellow
  PATCH: "\x1b[35m", // magenta
  DELETE: "\x1b[31m", // red
};

function statusColor(status: number): string {
  if (status >= 500) return "\x1b[31m";
  if (status >= 400) return "\x1b[33m";
  return "\x1b[32m";
}

/** Pull `{ error, message }` out of a failed response without consuming it. */
async function errorDetail(res: Response): Promise<{ code: string; detail: string }> {
  try {
    const body = await res.clone().text();
    if (!body) return { code: "unknown_error", detail: "" };
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return { code: "unknown_error", detail: "" };
    const error = "error" in parsed ? parsed.error : undefined;
    const message = "message" in parsed ? parsed.message : undefined;
    const code = typeof error === "string" ? error : "";
    const msg = typeof message === "string" ? message : "";
    return { code, detail: `${code}${msg ? ` "${msg}"` : ""}`.slice(0, 160) };
  } catch {
    return { code: "unknown_error", detail: "" }; // non-JSON failure
  }
}

export async function requestLogger(c: Ctx, next: Next) {
  const path = c.req.path;
  if (path === "/health") return next();

  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;

  const mc = METHOD_COLOR[c.req.method] ?? "";
  const who = c.get("username");
  const user = who ? ` ${DIM}· ${who}${RESET}` : "";
  const failure = status >= 400 ? await errorDetail(c.res) : null;
  const why = failure?.detail ? ` ${DIM}· ${failure.detail}${RESET}` : "";
  // Exclude the operator's own reads and unknown/non-API traffic. Redis keeps
  // shared minute counters, so replicas aggregate without collecting content.
  if (path.startsWith("/api/") && path !== "/api/admin" && !path.startsWith("/api/admin/")) {
    void recordOperationalRequest(status, failure?.code, path === "/api/billing/webhook");
  }

  console.log(
    `${mc}[${c.req.method}]${RESET} ${path} → ${statusColor(status)}${status}${RESET} ` +
      `${DIM}(${log.duration(ms)})${RESET}${user}${why}`
  );
}
