import type { Context, Next } from "hono";
import { parseToken } from "../lib/jwt.ts";
import { readAuthCookie, clearAuthCookie } from "../lib/cookies.ts";

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
  c.set("userId", claims.sub);
  c.set("username", claims.username);
  await next();
}
