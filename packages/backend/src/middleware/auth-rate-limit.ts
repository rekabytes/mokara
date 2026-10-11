import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";
import { env } from "../env.ts";
import { getRedis } from "../redis.ts";
import { authClientIp, consumeAuthLimit, ipBucket } from "../lib/auth-protection.ts";

export function authRateLimit(scope: "signup" | "login" | "oauth"): MiddlewareHandler {
  return async (c, next) => {
    let peer: string | undefined;
    // In-process Hono tests have no socket; they intentionally share one bucket.
    if (c.env?.incoming) peer = getConnInfo(c).remote.address;
    const address = authClientIp(c.req.raw.headers, peer, env.AUTH_PROXY_SECRET);
    try {
      const retry = await consumeAuthLimit(
        getRedis(),
        scope,
        ipBucket(address),
        env.AUTH_SECRET || "mokara-local-auth-limits"
      );
      if (retry) {
        c.header("Retry-After", String(retry));
        return c.json(
          { error: "auth_rate_limited", message: "Too many attempts. Please try again later." },
          429
        );
      }
    } catch {
      return c.json(
        {
          error: "auth_protection_unavailable",
          message: "Sign-in protection is temporarily unavailable. Please try again.",
        },
        503
      );
    }
    await next();
  };
}
