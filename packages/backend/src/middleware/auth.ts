import type { Context, Next } from "hono";
import { parseToken } from "../lib/jwt.ts";
import { isSessionValid } from "../lib/sessions.ts";
import { getRedis } from "../redis.ts";
import { readAuthCookie, clearAuthCookie } from "../lib/cookies.ts";
import { log } from "../lib/logger.ts";

export type Vars = {
  userId: string;
  username: string;
};

export async function authRequired(c: Context, next: Next) {
  const token = readAuthCookie(c);
  if (!token) {
    return c.json({ error: "not_authenticated", message: "login required" }, 401);
  }
  const claims = await parseToken(token);
  if (!claims) {
    clearAuthCookie(c);
    return c.json({ error: "not_authenticated", message: "session expired" }, 401);
  }

  // Fail closed: when the denylist and floor cannot be consulted, reject
  // instead of trusting a token whose revocation status is unknown. It answers
  // 503, not 401 — the session may be perfectly valid; only the check is
  // unavailable.
  let valid: boolean;
  try {
    valid = await isSessionValid(getRedis(), claims);
  } catch {
    log.warn("session validity check unavailable — failing closed");
    return c.json(
      { error: "service_unavailable", message: "session check unavailable — try again" },
      503
    );
  }
  if (!valid) {
    clearAuthCookie(c);
    return c.json({ error: "not_authenticated", message: "session expired" }, 401);
  }

  c.set("userId", claims.sub);
  c.set("username", claims.username);
  await next();
}
