import { Hono } from "hono";
import type { Context } from "hono";
import { isUniqueViolation } from "../lib/db-error.ts";
import { prisma } from "../db.ts";
import {
  signUpSchema,
  loginSchema,
  changePasswordSchema,
  updateMeSchema,
} from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { issueToken, parseToken } from "../lib/jwt.ts";
import { setAuthCookie, clearAuthCookie, readAuthCookie } from "../lib/cookies.ts";
import {
  revokeToken,
  revokeAllSessions,
  listSessions,
  revokeSessionById,
} from "../lib/sessions.ts";
import { authRequired } from "../middleware/auth.ts";
import { getRedis } from "../redis.ts";
import { log } from "../lib/logger.ts";
import { toUser } from "../lib/types.ts";
import { ensureUniqueSlug, slugify } from "../lib/slug.ts";
import type { Vars } from "../middleware/auth.ts";

export const authRoutes = new Hono<{ Variables: Vars }>();

authRoutes.post("/signup", validate("json", signUpSchema), async (c) => {
  const { username, password, display_name } = c.req.valid("json");

  const hash = await hashPassword(password);
  try {
    const u = await prisma.user.create({
      data: {
        username,
        passwordHash: hash,
        displayName: display_name && display_name.length > 0 ? display_name : null,
      },
    });
    // PRD-06: every account starts life with a private "Personal" workspace.
    // The frontend boot fallback stays only for legacy accounts that somehow
    // have no container at all.
    const slug = await ensureUniqueSlug(async (s) => {
      const found = await prisma.team.findUnique({ where: { slug: s }, select: { id: true } });
      return Boolean(found);
    }, slugify("Personal"));
    await prisma.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: { name: "Personal", slug, ownerId: u.id, kind: "workspace" },
      });
      await tx.teamMember.create({
        data: { teamId: t.id, userId: u.id, role: "owner" },
      });
    });
    const token = await issueToken(u.id, u.username);
    setAuthCookie(c, token);
    return c.json({ user: toUser(u) }, 201);
  } catch (e) {
    if (isUniqueViolation(e, "users_username_key")) {
      return c.json({ error: "username_taken", message: "username already exists" }, 409);
    }
    throw e;
  }
});

authRoutes.post("/login", validate("json", loginSchema), async (c) => {
  const { username, password } = c.req.valid("json");

  const u = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, createdAt: true, passwordHash: true },
  });

  // Constant-ish response on any failure (don't leak whether the user exists).
  const fail = () =>
    c.json({ error: "invalid_credentials", message: "invalid username or password" }, 401);

  if (!u) return fail();
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) return fail();

  const token = await issueToken(u.id, u.username);
  setAuthCookie(c, token);
  return c.json({ user: toUser(u) });
});

authRoutes.post("/logout", async (c) => {
  const token = readAuthCookie(c);
  if (token) {
    const claims = await parseToken(token);
    // Best-effort revocation: if Redis is down the cookie is still cleared so
    // a user is never trapped signed in — and the unrevoked token buys
    // nothing during the outage, because every authed request 503s while the
    // middleware cannot consult the denylist.
    if (claims) {
      try {
        await revokeToken(getRedis(), claims);
      } catch {
        log.warn("logout could not reach Redis — token not revoked");
      }
    }
  }
  clearAuthCookie(c);
  return c.body(null, 204);
});

authRoutes.get("/me", meHandler);

// PRD-08: both routes guard themselves because /api/auth stays public (login
// and signup live there); only these two need the session.
authRoutes.post("/password", authRequired, validate("json", changePasswordSchema), async (c) => {
  const userId = c.get("userId");
  const { current_password, new_password } = c.req.valid("json");
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!u) {
    return c.json({ error: "lookup_failed", message: "user not found" }, 500);
  }
  const ok = await verifyPassword(current_password, u.passwordHash);
  if (!ok) {
    return c.json({ error: "incorrect_password", message: "current password is incorrect" }, 401);
  }
  const hash = await hashPassword(new_password);
  // Floor first: a failure here revokes sessions without changing the password
  // (safe direction) — the other order would leave old sessions alive under a
  // new password.
  await revokeAllSessions(getRedis(), u.id);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: hash } });
  // Stay signed in on this device: the fresh token's iat clears the new floor.
  const token = await issueToken(u.id, u.username);
  setAuthCookie(c, token);
  return c.body(null, 204);
});

authRoutes.post("/revoke-all", authRequired, async (c) => {
  await revokeAllSessions(getRedis(), c.get("userId"));
  clearAuthCookie(c);
  return c.body(null, 204);
});

// PRD-08: the Settings device list. `current` lets the UI tag the calling
// device; revoking that row behaves like a logout on the caller.
authRoutes.get("/sessions", authRequired, async (c) => {
  const userId = c.get("userId");
  const own = c.get("jti");
  const rows = await listSessions(getRedis(), userId);
  return c.json({
    sessions: rows.map(({ id, record }) => ({
      id,
      device: record.ua,
      created_at: new Date(record.iat * 1000).toISOString(),
      last_seen_at: new Date(record.seen * 1000).toISOString(),
      current: id === own,
    })),
  });
});

authRoutes.delete("/sessions/:id", authRequired, async (c) => {
  const target = c.req.param("id");
  if (target === undefined) {
    return c.json({ error: "not_found", message: "session not found" }, 404);
  }
  await revokeSessionById(getRedis(), c.get("userId"), target);
  return c.body(null, 204);
});

// PRD-08: profile updates ride the authed surface next to GET /me. The route
// (and its validate middleware) live in index.ts beside the GET mount — a
// standalone Context parameter cannot carry the validated-json type an inline
// handler infers — so this data-level helper is what the route calls.
export async function updateMe(userId: string, displayName: string | null) {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { displayName },
    select: { id: true, username: true, displayName: true, createdAt: true },
  });
  return toUser(u);
}

// `me` lives on the authed surface; export the handler so index.ts can mount
// it there without re-fetching through the auth sub-app.
export async function meHandler(c: Context<{ Variables: Vars }>) {
  const userId = c.get("userId");
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, createdAt: true },
  });
  if (!u) {
    return c.json({ error: "lookup_failed", message: "user not found" }, 500);
  }
  return c.json({ user: toUser(u) });
}
