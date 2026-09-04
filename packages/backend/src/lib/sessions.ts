import type { Redis } from "ioredis";
import { TOKEN_LIFETIME_S } from "./jwt.ts";

// Two server-side revocation mechanisms, both consulted on every authed
// request (middleware/auth.ts):
//
// 1. Per-session denylist — `mokara:revoked:<jti>`. Logout writes the current
//    token's jti with a TTL equal to its remaining life, killing exactly that
//    session (a copied cookie dies with it).
// 2. Per-user floor — `mokara:user:<id>:minIat`. "Sign out everywhere" (and a
//    password change, which must do the same to other devices) bumps the floor
//    to now; any token issued before it fails the `iat >= floor` check. The
//    current device survives a password change because the handler re-issues a
//    fresh token afterwards (PRD-08 §3).
//
// Keys expire on their own or hold only a timestamp, so nothing personal is
// stored and no sweeping job is needed.
const REVOKED_PREFIX = "mokara:revoked:";
const USER_PREFIX = "mokara:user:";

function revokedKey(jti: string): string {
  return REVOKED_PREFIX + jti;
}

function minIatKey(userId: string): string {
  return `${USER_PREFIX}${userId}:minIat`;
}

// Marks the token's jti invalid until its natural expiry (or the default
// lifetime when the claim is somehow missing). Throws on Redis failure —
// callers decide whether that means fail-closed (middleware) or best-effort
// (logout route).
export async function revokeToken(
  redis: Redis,
  token: { jti: string; exp?: number }
): Promise<void> {
  const nowS = Math.floor(Date.now() / 1000);
  const remaining = token.exp ? token.exp - nowS : TOKEN_LIFETIME_S;
  await redis.set(revokedKey(token.jti), "1", "EX", Math.max(1, remaining));
}

// Invalidates every session the user has anywhere, including the caller's own.
// The floor only ever moves forward and never expires; logins do not lower it,
// so a login can never un-revoke sessions issued before it.
export async function revokeAllSessions(redis: Redis, userId: string): Promise<void> {
  await redis.set(minIatKey(userId), String(Math.floor(Date.now() / 1000)));
}

// True when the token is neither denylisted nor older than the user's floor.
// Two small reads (an indexed-key EXISTS and a GET) — local Redis makes the
// extra round trip cheaper than the pipeline/Lua complexity it saves. Throws
// on Redis failure; middleware/auth.ts fails closed on that.
export async function isSessionValid(
  redis: Redis,
  token: { sub: string; jti: string; iat?: number }
): Promise<boolean> {
  if ((await redis.exists(revokedKey(token.jti))) === 1) return false;
  const floorRaw = await redis.get(minIatKey(token.sub));
  if (floorRaw === null) return true;
  const floor = Number(floorRaw);
  // A token without iat (none exist — every issued token carries one) cannot
  // prove it postdates the floor, so it fails.
  return token.iat !== undefined && token.iat >= floor;
}
