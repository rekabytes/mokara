import type { Context, Next } from "hono";
import { log } from "../lib/logger.ts";

// Per-request logger. Skips /health so the probe doesn't flood the terminal.
// Format: [METHOD] path → STATUS (duration)
export async function requestLogger(c: Context, next: Next) {
  const path = c.req.path;
  if (path === "/health") return next();

  const start = Date.now();
  await next();
  const status = c.res.status;
  const ms = Date.now() - start;

  const color =
    status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
  const reset = "\x1b[0m";
  console.log(
    `[${c.req.method}] ${path} → ${color}${status}${reset} (${log.duration(ms)})`,
  );
}
