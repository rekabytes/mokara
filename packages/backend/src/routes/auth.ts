import { Hono } from "hono";
import type { Context } from "hono";
import { isUniqueViolation } from "../lib/db-error.ts";
import { prisma } from "../db.ts";
import { signUpSchema, loginSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { issueToken } from "../lib/jwt.ts";
import { setAuthCookie, clearAuthCookie } from "../lib/cookies.ts";
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

authRoutes.post("/logout", (c) => {
  clearAuthCookie(c);
  return c.body(null, 204);
});

authRoutes.get("/me", meHandler);

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
