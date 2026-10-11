import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { env, isProd } from "../env.ts";
import { prisma } from "../db.ts";
import { getRedis } from "../redis.ts";
import { authRequired, type Vars } from "../middleware/auth.ts";
import { authRateLimit } from "../middleware/auth-rate-limit.ts";
import { readAuthCookie, setAuthCookie } from "../lib/cookies.ts";
import { issueToken, parseToken } from "../lib/jwt.ts";
import { isSessionValid } from "../lib/sessions.ts";
import { usernameSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { isUniqueViolation } from "../lib/db-error.ts";
import { toMe } from "../lib/types.ts";
import { verifySignupChallenge } from "../lib/auth-protection.ts";
import {
  SocialAuthError,
  SocialProviderSchema,
  PendingSocialSchema,
  SOCIAL_TTL,
  randomToken,
  tokenDigest,
  socialOrigin,
  socialProviderConfig,
  socialReturnPath,
  createSocialFlow,
  consumeSocialFlow,
  socialAuthorizeUrl,
  exchangeSocialIdentity,
  type SocialProfile,
  type PendingSocial,
} from "../lib/social-auth.ts";

export const socialAuthRoutes = new Hono<{ Variables: Vars }>();
const cookieName = (suffix: string) => `${isProd ? "__Host-" : ""}mokara_social_${suffix}`;
function setSocialCookie(c: Context, suffix: string, value: string) {
  setCookie(c, cookieName(suffix), value, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: SOCIAL_TTL,
  });
}
function clearSocialCookie(c: Context, suffix: string) {
  deleteCookie(c, cookieName(suffix), { secure: isProd, path: "/" });
}
function trustedOrigin(c: Context) {
  const origin = socialOrigin();
  return Boolean(origin && c.req.header("origin") === origin);
}
async function activeSession(c: Context) {
  const raw = readAuthCookie(c);
  const claims = raw ? await parseToken(raw) : null;
  if (!claims || !(await isSessionValid(getRedis(), claims))) return null;
  return claims;
}
async function pendingProfile(c: Context): Promise<{ key: string; pending: PendingSocial }> {
  const token = getCookie(c, cookieName("pending"));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new SocialAuthError("social_expired");
  const key = `mokara:social:pending:${tokenDigest(token)}`;
  const raw = await getRedis().get(key);
  if (!raw) throw new SocialAuthError("social_expired");
  const parsed = PendingSocialSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new SocialAuthError("social_expired");
  return { key, pending: parsed.data };
}
function socialFailure(c: Context, error: unknown, linking = false) {
  const code = error instanceof SocialAuthError ? error.code : "social_failed";
  return c.redirect(`${linking ? "/settings" : "/login"}?auth_error=${code}`, 303);
}

socialAuthRoutes.get("/social/providers", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    providers: ["google", "github"].map((value) => {
      const provider = SocialProviderSchema.parse(value);
      return { provider, enabled: socialProviderConfig(provider).enabled };
    }),
  });
});

socialAuthRoutes.get("/social/connections", authRequired, async (c) => {
  c.header("Cache-Control", "no-store");
  const connections = await prisma.authIdentity.findMany({
    where: { userId: c.get("userId") },
    select: { provider: true, email: true },
  });
  return c.json({ connections });
});

const StartSchema = z
  .object({
    intent: z.enum(["login", "link"]).default("login"),
    from: z.string().max(1000).optional(),
  })
  .strict();
socialAuthRoutes.post(
  "/social/:provider/start",
  authRateLimit("oauth"),
  validate("json", StartSchema),
  async (c) => {
    c.header("Cache-Control", "no-store");
    if (!trustedOrigin(c))
      return c.json({ error: "forbidden", message: "Start sign-in from Mokara." }, 403);
    const provider = SocialProviderSchema.safeParse(c.req.param("provider"));
    if (!provider.success || !socialProviderConfig(provider.data).enabled)
      return c.json(
        { error: "social_unavailable", message: "This sign-in provider is not configured." },
        503
      );
    const { intent, from } = c.req.valid("json");
    try {
      const session = await activeSession(c);
      if (intent === "link" && !session)
        return c.json(
          { error: "not_authenticated", message: "Sign in before connecting a provider." },
          401
        );
      if (intent === "login" && session)
        return c.json(
          {
            error: "social_session_changed",
            message: "Use Settings to connect another sign-in method.",
          },
          409
        );
      const browser = randomToken();
      const { state, flow } = await createSocialFlow(
        provider.data,
        browser,
        intent === "link" ? "/settings" : socialReturnPath(from),
        intent === "link" && session ? { userId: session.sub, sessionId: session.jti } : undefined
      );
      setSocialCookie(c, provider.data, browser);
      return c.json({ url: socialAuthorizeUrl(provider.data, state, flow) });
    } catch {
      return c.json(
        { error: "social_unavailable", message: "Sign-in is temporarily unavailable." },
        503
      );
    }
  }
);

async function linkIdentity(userId: string, profile: SocialProfile) {
  // Stable identity and per-user/provider uniqueness are database-enforced.
  // Never update another account or merge by provider email/username.
  const existing = await prisma.authIdentity.findUnique({
    where: { provider_subject: { provider: profile.provider, subject: profile.subject } },
  });
  if (existing) {
    if (existing.userId !== userId) throw new SocialAuthError("social_identity_in_use");
    return;
  }
  const current = await prisma.authIdentity.findUnique({
    where: { userId_provider: { userId, provider: profile.provider } },
  });
  if (current) throw new SocialAuthError("social_identity_in_use");
  try {
    await prisma.authIdentity.create({
      data: { userId, provider: profile.provider, subject: profile.subject, email: profile.email },
    });
  } catch (error) {
    if (isUniqueViolation(error, "auth_identities"))
      throw new SocialAuthError("social_identity_in_use");
    throw error;
  }
}

socialAuthRoutes.get("/social/:provider/callback", authRateLimit("oauth"), async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  const provider = SocialProviderSchema.safeParse(c.req.param("provider"));
  if (!provider.success) return socialFailure(c, new SocialAuthError("social_failed"));
  let linking = false;
  try {
    const browser = getCookie(c, cookieName(provider.data));
    clearSocialCookie(c, provider.data);
    const flow = await consumeSocialFlow(c.req.query("state") ?? "", browser, provider.data);
    linking = Boolean(flow.userId);
    const session = await activeSession(c);
    if (
      linking ? session?.sub !== flow.userId || session?.jti !== flow.sessionId : Boolean(session)
    )
      throw new SocialAuthError("social_session_changed");
    if (c.req.query("error")) throw new SocialAuthError("social_cancelled");
    const code = c.req.query("code");
    if (!code || code.length > 4096) throw new SocialAuthError("social_failed");
    const profile = await exchangeSocialIdentity(provider.data, code, flow);
    if (flow.userId) {
      await linkIdentity(flow.userId, profile);
      return c.redirect("/settings?auth_connected=1", 303);
    }
    const identity = await prisma.authIdentity.findUnique({
      where: { provider_subject: { provider: profile.provider, subject: profile.subject } },
      include: { user: true },
    });
    if (identity) {
      setAuthCookie(c, await issueToken(identity.user.id, identity.user.username));
      return c.redirect(socialReturnPath(flow.from), 303);
    }
    const pendingToken = randomToken();
    const stored = await getRedis().set(
      `mokara:social:pending:${tokenDigest(pendingToken)}`,
      JSON.stringify({ profile, from: flow.from }),
      "EX",
      SOCIAL_TTL,
      "NX"
    );
    if (stored !== "OK") throw new SocialAuthError("social_unavailable");
    setSocialCookie(c, "pending", pendingToken);
    return c.redirect("/signup/social", 303);
  } catch (error) {
    return socialFailure(c, error, linking);
  }
});

socialAuthRoutes.get("/social/pending", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const { pending } = await pendingProfile(c);
    return c.json({
      provider: pending.profile.provider,
      email: pending.profile.email,
      display_name: pending.profile.name.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof SocialAuthError && error.code === "social_expired") {
      return c.json(
        { error: "social_expired", message: "Sign-in expired. Please start again." },
        400
      );
    }
    return c.json(
      { error: "social_unavailable", message: "Sign-in is temporarily unavailable." },
      503
    );
  }
});

const CompleteSchema = z
  .object({
    turnstile_token: z.string().min(1).max(2048).optional(),
  })
  .strict();
socialAuthRoutes.post(
  "/social/complete",
  authRateLimit("signup"),
  validate("json", CompleteSchema),
  async (c) => {
    if (!trustedOrigin(c))
      return c.json({ error: "forbidden", message: "Complete registration from Mokara." }, 403);
    let lockKey: string | undefined;
    const lockOwner = randomToken();
    try {
      if (await activeSession(c))
        return c.json(
          {
            error: "social_session_changed",
            message: "Use Settings to connect this provider to your account.",
          },
          409
        );
      const { key, pending } = await pendingProfile(c);
      const { turnstile_token } = c.req.valid("json");
      const verification = await verifySignupChallenge(turnstile_token, env);
      if (verification !== "ok")
        return c.json(
          {
            error:
              verification === "invalid" ? "verification_failed" : "auth_protection_unavailable",
            message: "Please complete registration verification again.",
          },
          verification === "invalid" ? 400 : 503
        );
      lockKey = `${key}:lock`;
      if ((await getRedis().set(lockKey, lockOwner, "EX", 30, "NX")) !== "OK") {
        lockKey = undefined;
        return c.json(
          {
            error: "social_busy",
            message: "Registration is already being processed. Please wait.",
          },
          409
        );
      }
      // Recheck pending state after acquiring the lock: another request may have
      // completed while this request was verifying its challenge.
      if (!(await getRedis().exists(key))) throw new SocialAuthError("social_expired");
      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            username: `u_${tokenDigest(randomToken()).slice(0, 18)}`,
            usernameClaimed: false,
            passwordHash: null,
            displayName: pending.profile.name.slice(0, 50) || null,
            authIdentities: {
              create: {
                provider: pending.profile.provider,
                subject: pending.profile.subject,
                email: pending.profile.email,
              },
            },
          },
        });
        const team = await tx.team.create({
          data: {
            name: "Personal",
            slug: `personal-${randomToken().slice(0, 16).toLowerCase()}`,
            ownerId: u.id,
            kind: "workspace",
          },
        });
        await tx.teamMember.create({ data: { teamId: team.id, userId: u.id, role: "owner" } });
        return u;
      });
      await getRedis().del(key);
      clearSocialCookie(c, "pending");
      setAuthCookie(c, await issueToken(user.id, user.username));
      return c.json({ user: toMe(user), redirect: socialReturnPath(pending.from) }, 201);
    } catch (error) {
      if (isUniqueViolation(error, "users_username_key"))
        return c.json(
          {
            error: "social_unavailable",
            message: "Could not assign a temporary username. Please try again.",
          },
          503
        );
      if (isUniqueViolation(error, "auth_identities"))
        return c.json(
          {
            error: "social_identity_in_use",
            message: "This provider account already has a Mokara account. Sign in again.",
          },
          409
        );
      const code = error instanceof SocialAuthError ? error.code : "social_unavailable";
      return c.json(
        { error: code, message: "Registration could not finish. Please try signing in again." },
        code === "social_expired" ? 400 : 503
      );
    } finally {
      if (lockKey) {
        // Release only our lease; never delete a lock acquired by a later request.
        try {
          await getRedis().eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            1,
            lockKey,
            lockOwner
          );
        } catch {
          /* bounded expiry handles an unavailable Redis */
        }
      }
    }
  }
);

const ClaimUsernameSchema = z.object({ username: usernameSchema }).strict();
socialAuthRoutes.post(
  "/social/username/claim",
  authRequired,
  authRateLimit("oauth"),
  validate("json", ClaimUsernameSchema),
  async (c) => {
    if (!trustedOrigin(c))
      return c.json(
        { error: "forbidden", message: "Claim your username from Mokara Settings." },
        403
      );
    try {
      // The conditional write serializes concurrent claims. Existing chosen
      // usernames cannot be changed by this endpoint; ownership uses user ID.
      const user = await prisma.$transaction(async (tx) => {
        const changed = await tx.user.updateMany({
          where: { id: c.get("userId"), usernameClaimed: false },
          data: { username: c.req.valid("json").username, usernameClaimed: true },
        });
        if (changed.count !== 1) return null;
        return tx.user.findUnique({ where: { id: c.get("userId") } });
      });
      if (!user)
        return c.json(
          {
            error: "username_already_claimed",
            message: "Your account already has a claimed username.",
          },
          409
        );
      setAuthCookie(c, await issueToken(user.id, user.username));
      return c.json({ user: toMe(user) });
    } catch (error) {
      if (isUniqueViolation(error, "users_username_key"))
        return c.json(
          { error: "username_taken", message: "This username is already taken. Choose another." },
          409
        );
      throw error;
    }
  }
);
