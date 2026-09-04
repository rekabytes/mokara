import type { Redis } from "ioredis";
import { TOKEN_LIFETIME_S } from "./jwt.ts";

// Three server-side revocation/registry mechanisms, all in Redis and all
// consulted or maintained around every authed request (middleware/auth.ts):
//
// 1. Per-session denylist — `mokara:revoked:<jti>`. Logout (and per-session
//    logouts from Settings) write the jti with a TTL equal to the token's
//    remaining life, killing exactly that session (a copied cookie dies too).
// 2. Per-user floor — `mokara:user:<id>:minIat`. "Sign out everywhere" (and a
//    password change, which must do the same to other devices) bumps the floor
//    to now; any token issued before it fails the `iat >= floor` check. The
//    current device survives a password change because the handler re-issues a
//    fresh token afterwards (PRD-08 §3).
// 3. Session registry — `mokara:user:<id>:jtis` (a set of live jtis) plus one
//    `mokara:sess:<jti>` JSON record per session (device label, issue/expiry/
//    last-seen times, TTL = remaining life). Powers the Settings device list.
//    Members whose record has expired are removed lazily at list time.
//
// Nothing personal is stored: opaque ids, timestamps and a coarse device
// label. Keys expire on their own, so no sweeping job is needed.
const REVOKED_PREFIX = "mokara:revoked:";
const USER_PREFIX = "mokara:user:";
const SESS_PREFIX = "mokara:sess:";

// Last-seen writes are throttled to one per minute per session; the registry
// is metadata, not telemetry.
const SEEN_REFRESH_S = 60;

export interface SessionRecord {
  ua: string; // coarse label, e.g. "Chrome on macOS" — never the raw header
  iat: number;
  exp: number;
  seen: number;
}

function revokedKey(jti: string): string {
  return REVOKED_PREFIX + jti;
}

function minIatKey(userId: string): string {
  return `${USER_PREFIX}${userId}:minIat`;
}

function userJtisKey(userId: string): string {
  return `${USER_PREFIX}${userId}:jtis`;
}

function sessKey(jti: string): string {
  return SESS_PREFIX + jti;
}

function isSessionRecord(v: unknown): v is SessionRecord {
  if (typeof v !== "object" || v === null) return false;
  return (
    "ua" in v &&
    "iat" in v &&
    "exp" in v &&
    "seen" in v &&
    typeof v.ua === "string" &&
    typeof v.iat === "number" &&
    typeof v.exp === "number" &&
    typeof v.seen === "number"
  );
}

function parseRecord(raw: string): SessionRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSessionRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Denylists the jti until its natural expiry (or the default lifetime when the
// claim is somehow missing) and removes the session from the registry. Throws
// on Redis failure — callers decide whether that means fail-closed
// (middleware) or best-effort (logout route).
export async function revokeToken(
  redis: Redis,
  token: { sub: string; jti: string; exp?: number }
): Promise<void> {
  const nowS = Math.floor(Date.now() / 1000);
  const remaining = token.exp ? token.exp - nowS : TOKEN_LIFETIME_S;
  await redis.set(revokedKey(token.jti), "1", "EX", Math.max(1, remaining));
  await redis.del(sessKey(token.jti));
  await redis.srem(userJtisKey(token.sub), token.jti);
}

// Invalidates every session the user has anywhere, including the caller's own:
// bump the floor and wipe the registry (the per-session records die by their
// own TTLs; denylist keys from earlier single-session logouts stay, harmless).
// The floor only ever moves forward and never expires; logins do not lower it.
export async function revokeAllSessions(redis: Redis, userId: string): Promise<void> {
  const nowS = Math.floor(Date.now() / 1000);
  await redis.set(minIatKey(userId), String(nowS));
  await redis.del(userJtisKey(userId));
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

// Registers a new session or refreshes last-seen. Called from the middleware
// after the validity check passes, so only live sessions enter the registry.
// Throws on Redis failure; the middleware catches (and merely logs) this one —
// bookkeeping must not take a request down the way a security check can.
export async function trackSession(
  redis: Redis,
  opts: { sub: string; jti: string; iat?: number; exp?: number; ua: string }
): Promise<void> {
  const seen = Math.floor(Date.now() / 1000);
  const prevRaw = await redis.get(sessKey(opts.jti));
  if (prevRaw !== null) {
    const prev = parseRecord(prevRaw);
    if (prev !== null && seen - prev.seen < SEEN_REFRESH_S) return;
  }
  const iat = opts.iat ?? seen;
  const exp = opts.exp ?? iat + TOKEN_LIFETIME_S;
  const record: SessionRecord = { ua: opts.ua, iat, exp, seen };
  const remaining = Math.max(1, exp - seen);
  await redis.set(sessKey(opts.jti), JSON.stringify(record), "EX", remaining);
  await redis.sadd(userJtisKey(opts.sub), opts.jti);
}

// Live sessions for the device list. Members whose record has expired (their
// token died naturally) are dropped from the set on the way out.
export async function listSessions(
  redis: Redis,
  userId: string
): Promise<Array<{ id: string; record: SessionRecord }>> {
  const setKey = userJtisKey(userId);
  const jtis = await redis.smembers(setKey);
  if (jtis.length === 0) return [];
  const raws = await redis.mget(jtis.map(sessKey));
  const live: Array<{ id: string; record: SessionRecord }> = [];
  const stale: string[] = [];
  for (const [i, jti] of jtis.entries()) {
    const raw = raws[i];
    const record = raw === null ? null : parseRecord(raw);
    if (record === null) {
      stale.push(jti);
      continue;
    }
    live.push({ id: jti, record });
  }
  if (stale.length > 0) await redis.srem(setKey, ...stale);
  return live;
}

// Logs out one session by id, whatever state it is in: live → denylisted and
// unregistered; expired → just unregistered. Idempotent — revoking an unknown
// id is still "that session is not live afterwards", so callers always get a
// 204 and refresh their list.
export async function revokeSessionById(redis: Redis, userId: string, jti: string): Promise<void> {
  const raw = await redis.get(sessKey(jti));
  const record = raw === null ? null : parseRecord(raw);
  await revokeToken(redis, { sub: userId, jti, exp: record?.exp });
}
