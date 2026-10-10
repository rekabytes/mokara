import { Hono } from "hono";
import { prisma } from "../db.ts";
import { adminConfigured, env } from "../env.ts";
import { issueAdminToken, safeEqual } from "../lib/admin-token.ts";
import { log } from "../lib/logger.ts";
import { effectivePlan } from "../lib/plans.ts";
import { validate } from "../lib/validate.ts";
import {
  adminLoginSchema,
  adminPlanSchema,
  adminPageSchema,
  adminUserParamSchema,
  adminAuditQuerySchema,
} from "../lib/validation.ts";
import { GITHUB_USER_VERIFICATION_TTL_MS } from "../lib/github-repositories.ts";
import { monitoringOverview, attentionJobs, ADMIN_PAGE_SIZE } from "./admin-monitoring.ts";
import { adminSupportRoutes, auditFilter } from "./admin-support.ts";
import { adminRequired } from "../middleware/admin.ts";

// The operator console's API. Mounted on the public `api` app (index.ts) before
// the authed sub-app, for the same reason the Stripe webhook is: none of these
// routes carry a user session. `/login` is the one public surface; the rest
// authenticate with the console's own Bearer token (middleware/admin.ts), which
// packages/admin attaches server-side — the browser never holds it.
//
// When the console is unconfigured every path answers a plain 404. Unlike
// billing's honest `billing_not_configured`, an admin surface should not
// announce that it could exist.

export const adminRoutes = new Hono<{ Variables: { adminActor: string } }>();

adminRoutes.route("/", adminSupportRoutes);

adminRoutes.get("/overview", adminRequired, async (c) => c.json(await monitoringOverview()));
adminRoutes.get("/attention", adminRequired, validate("query", adminPageSchema), async (c) =>
  c.json(await attentionJobs(c.req.valid("query").page))
);
adminRoutes.get("/audit", adminRequired, validate("query", adminAuditQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const { page } = query;
  const where = auditFilter(query);
  const [total, events] = await prisma.$transaction([
    prisma.adminAuditEvent.count({ where }),
    prisma.adminAuditEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
    }),
  ]);
  return c.json({
    page,
    page_size: ADMIN_PAGE_SIZE,
    total,
    events: events.map((event) => ({
      id: event.id,
      actor: event.actor,
      action: event.action,
      target_user_id: event.targetUserId,
      target_username: event.targetUsername,
      from_plan: event.fromPlan,
      to_plan: event.toPlan,
      created_at: event.createdAt.toISOString(),
    })),
  });
});

// POST /login — credentials + the login-URL key, all three compared before any
// answer so a failure costs the same time whichever one was wrong (the user
// login path has a bcrypt timing oracle; this one must not repeat it).
adminRoutes.post("/login", validate("json", adminLoginSchema), async (c) => {
  if (!adminConfigured) {
    return c.json({ error: "not_found", message: "not found" }, 404);
  }
  const { username, password, url_key } = c.req.valid("json");
  const keyOk = safeEqual(url_key, env.ADMIN_URL_KEY);
  const userOk = safeEqual(username, env.ADMIN_USERNAME);
  const passOk = safeEqual(password, env.ADMIN_PASSWORD);
  if (!keyOk || !userOk || !passOk) {
    return c.json({ error: "invalid_credentials", message: "invalid admin credentials" }, 401);
  }
  return c.json({ token: await issueAdminToken() });
});

// GET /users — the console's index. Every user, newest first, with the number
// of workspaces each one created (one grouped count for the whole page rather
// than a query per row).
adminRoutes.get("/users", adminRequired, async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      plan: true,
      planOverride: true,
      createdAt: true,
      graceUntil: true,
      githubConnection: { select: { status: true, verifiedAt: true } },
      _count: {
        select: {
          githubIssueLinks: {
            where: { OR: [{ status: "failed" }, { syncStatus: { in: ["failed", "paused"] } }] },
          },
        },
      },
    },
  });
  const owned = await prisma.team.groupBy({ by: ["ownerId"], _count: { _all: true } });
  const ownedBy = new Map(owned.map((row) => [row.ownerId, row._count._all]));
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      // `plan` is always what the account actually gets; the other two are its
      // inputs, so the list can badge an operator grant without hiding Stripe's
      // opinion of the same account.
      plan: effectivePlan(u),
      stripe_plan: u.plan,
      plan_override: u.planOverride,
      created_at: u.createdAt.toISOString(),
      workspaces: ownedBy.get(u.id) ?? 0,
      attention_flags: [
        ...(u.graceUntil ? ["billing_grace_flag"] : []),
        ...(u.githubConnection?.status === "revoked" ? ["github_connection_revoked"] : []),
        ...(u.githubConnection?.status === "active" &&
        Date.now() - u.githubConnection.verifiedAt.getTime() > GITHUB_USER_VERIFICATION_TTL_MS
          ? ["github_reauthorization_required"]
          : []),
        ...(u._count.githubIssueLinks > 0 ? ["github_links_need_attention"] : []),
      ],
    })),
  });
});

// GET /users/:id — profile detail: the effective plan with BOTH of its inputs
// (what Stripe says, any operator grant), the billing context that explains
// them, and every workspace this user created with member counts.
adminRoutes.get("/users/:id", adminRequired, validate("param", adminUserParamSchema), async (c) => {
  const { id } = c.req.valid("param");
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      plan: true,
      planOverride: true,
      createdAt: true,
      stripeCustomerId: true,
      periodEnd: true,
      graceUntil: true,
      githubConnection: {
        select: {
          status: true,
          verifiedAt: true,
          _count: {
            select: {
              repositories: {
                where: {
                  enabled: true,
                  repository: { active: true, installation: { status: "active" } },
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          githubIssueLinks: {
            where: { OR: [{ status: "failed" }, { syncStatus: { in: ["failed", "paused"] } }] },
          },
        },
      },
    },
  });
  if (!user) {
    return c.json({ error: "not_found", message: "user not found" }, 404);
  }
  const workspaces = await prisma.team.findMany({
    where: { ownerId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      plan: effectivePlan(user),
      stripe_plan: user.plan,
      plan_override: user.planOverride,
      created_at: user.createdAt.toISOString(),
      // Read-only billing context, so an operator can see whether a plan came
      // from a subscription before granting over it.
      has_stripe_customer: user.stripeCustomerId !== null,
      period_end: user.periodEnd ? user.periodEnd.toISOString() : null,
      grace_until: user.graceUntil ? user.graceUntil.toISOString() : null,
      github: user.githubConnection
        ? {
            status: user.githubConnection.status,
            verified_at: user.githubConnection.verifiedAt.toISOString(),
            active_repositories: user.githubConnection._count.repositories,
            reauthorization_required:
              Date.now() - user.githubConnection.verifiedAt.getTime() >
              GITHUB_USER_VERIFICATION_TTL_MS,
          }
        : null,
      github_issue_links_needing_attention: user._count.githubIssueLinks,
    },
    total_workspaces: workspaces.length,
    workspaces: workspaces.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      kind: t.kind,
      members: t._count.members,
      created_at: t.createdAt.toISOString(),
    })),
  });
});

// PATCH /users/:id/plan — the operator GRANT, and the only writer of
// `users.plan_override`. It never touches `users.plan`: that column belongs to
// Stripe alone (lib/billing.ts). Separating them is what stops the two writers
// from fighting — the collision that used to wipe a grant on the user's next
// /settings load. Consequences, on purpose:
//
//   - a grant survives every billing sync and webhook; only a subscription that
//     resolves to a KNOWN tier retires it, so money still wins for a payer;
//   - "free" is how the console REVOKES: the column goes back to NULL and the
//     account falls back to whatever Stripe says. It does not cancel a
//     subscription — that is the billing portal's job, and one button here must
//     never strip a paying customer's plan;
//   - a grant needs no Stripe customer, invoice or period clock, so it works on
//     an instance with billing switched off entirely (PRD-11 §6.4 trials and
//     promo codes remain open decisions; this is the comp path meanwhile).
//
// Every grant is logged: this is the one endpoint that can hand out paid capacity
// for free, so it must leave a trail.
adminRoutes.patch(
  "/users/:id/plan",
  adminRequired,
  validate("param", adminUserParamSchema),
  validate("json", adminPlanSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { plan } = c.req.valid("json");
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.user.findUnique({
        where: { id },
        select: { id: true, username: true, plan: true, planOverride: true },
      });
      if (!existing) return null;
      const override = plan === "free" ? null : plan;
      if (existing.planOverride === override) return { user: existing, changed: false };
      const user = await tx.user.update({
        where: { id },
        data: { planOverride: override },
        select: { id: true, username: true, plan: true, planOverride: true },
      });
      await tx.adminAuditEvent.create({
        data: {
          actor: c.get("adminActor"),
          action: "plan_override_changed",
          targetUserId: user.id,
          targetUsername: user.username,
          fromPlan: existing.planOverride,
          toPlan: override,
        },
      });
      return { user, changed: true };
    });
    if (!result) return c.json({ error: "not_found", message: "user not found" }, 404);
    const { user } = result;
    if (result.changed)
      log.ok(`admin: ${user.username} operator grant changed (effective ${effectivePlan(user)})`);
    return c.json({
      user: {
        id: user.id,
        username: user.username,
        plan: effectivePlan(user),
        stripe_plan: user.plan,
        plan_override: user.planOverride,
      },
    });
  }
);
