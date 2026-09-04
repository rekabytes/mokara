import type { Redis } from "ioredis";
import { TOKEN_LIFETIME_S } from "./jwt.ts";

// Revoked-session denylist. Each JWT carries a `jti` (session id); logout
// writes `mokara:revoked:<jti>` with a TTL equal to the token's remaining
// life, and the auth middleware rejects any request whose jti is present.
// Keys expire on their own, so the denylist needs no sweeping job and holds
// no personal data — just an opaque random id until the token would have
// expired anyway.
const KEY_PREFIX = "mokara:revoked:";

function revokedKey(jti: string): string {
  return KEY_PREFIX + jti;
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

export async function isSessionRevoked(redis: Redis, jti: string): Promise<boolean> {
  return (await redis.exists(revokedKey(jti))) === 1;
}
