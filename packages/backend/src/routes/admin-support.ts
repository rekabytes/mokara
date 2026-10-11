import { Hono } from "hono";
import { z } from "zod";
import type { Prisma } from "@mokara/db/prisma/generated/client";
import { prisma } from "../db.ts";
import { isHosted, billingConfigured } from "../env.ts";
import { adminRequired } from "../middleware/admin.ts";
import { validate } from "../lib/validate.ts";
import {
  adminSupportQuerySchema,
  adminBillingQuerySchema,
  adminUserParamSchema,
  adminAuditQuerySchema,
} from "../lib/validation.ts";
import { effectivePlan, limitsFor, UNLIMITED, publicCap } from "../lib/plans.ts";
import { usedBytes } from "../lib/quota.ts";
import { safeMetricCode } from "../lib/operational-metrics.ts";
import { ADMIN_PAGE_SIZE } from "./admin-monitoring.ts";

export const adminSupportRoutes = new Hono();
export function supportCaps(owner: { plan: string; planOverride: string | null }) {
  const limits = isHosted ? limitsFor(effectivePlan(owner)) : UNLIMITED;
  return {
    members: publicCap(limits.members),
    teams: publicCap(limits.teams),
    storage_bytes: publicCap(limits.storageBytes),
    max_file_bytes: publicCap(limits.maxFileBytes),
    tasks: null,
  };
}
export function auditFilter(
  query: z.infer<typeof adminAuditQuerySchema>
): Prisma.AdminAuditEventWhereInput {
  const where: Prisma.AdminAuditEventWhereInput = {};
  if (query.actor) where.actor = { contains: query.actor, mode: "insensitive" };
  if (query.user)
    where.OR = [
      { targetUsername: { contains: query.user, mode: "insensitive" } },
      ...(z.uuid().safeParse(query.user).success ? [{ targetUserId: query.user }] : []),
    ];
  if (query.action) where.action = query.action;
  if (query.from || query.to)
    where.createdAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
      ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86400000) } : {}),
    };
  return where;
}

function userSearch(q: string): Prisma.UserWhereInput {
  return q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
}
export function billingFilter(q: string, status: string): Prisma.UserWhereInput {
  const search = userSearch(q);
  if (!status) return search;
  const filter: Prisma.UserWhereInput =
    status === "unknown"
      ? { billingStatus: null }
      : status === "error"
        ? { billingErrorCode: { not: null } }
        : status === "grant"
          ? { planOverride: { not: null } }
          : status === "payment_failed"
            ? { billingInvoiceStatus: "payment_failed" }
            : status === "canceling"
              ? {
                  billingStatus: { notIn: ["canceled", "incomplete_expired"] },
                  OR: [{ billingCancelAtPeriodEnd: true }, { billingCancelAt: { not: null } }],
                }
              : { billingStatus: status };
  return { AND: [search, filter] };
}

adminSupportRoutes.get(
  "/workspaces",
  adminRequired,
  validate("query", adminSupportQuerySchema),
  async (c) => {
    const { page, q } = c.req.valid("query");
    const where: Prisma.TeamWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { owner: { username: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {};
    const [total, teams] = await prisma.$transaction([
      prisma.team.count({ where }),
      prisma.team.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
          logoBytes: true,
          owner: { select: { id: true, username: true, plan: true, planOverride: true } },
          _count: { select: { members: true, tasks: true, attachments: true } },
        },
      }),
    ]);
    const files = teams.length
      ? await prisma.attachment.groupBy({
          by: ["teamId"],
          where: { teamId: { in: teams.map((t) => t.id) } },
          _sum: { sizeBytes: true },
        })
      : [];
    const bytes = new Map(files.map((row) => [row.teamId, row._sum.sizeBytes ?? 0]));
    return c.json({
      page,
      page_size: ADMIN_PAGE_SIZE,
      total,
      checked_at: new Date().toISOString(),
      workspaces: teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        kind: team.kind,
        owner: { id: team.owner.id, username: team.owner.username },
        plan: effectivePlan(team.owner),
        members: team._count.members,
        tasks: team._count.tasks,
        files: team._count.attachments,
        storage_bytes: (bytes.get(team.id) ?? 0) + (team.logoBytes ?? 0),
        limits: supportCaps(team.owner),
      })),
    });
  }
);

adminSupportRoutes.get(
  "/workspaces/:id",
  adminRequired,
  validate("param", adminUserParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const team = await prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        kind: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            username: true,
            plan: true,
            planOverride: true,
            githubConnection: { select: { status: true, verifiedAt: true } },
          },
        },
        members: {
          orderBy: { joinedAt: "asc" },
          select: { role: true, joinedAt: true, user: { select: { id: true, username: true } } },
        },
        _count: { select: { tasks: true, attachments: true } },
      },
    });
    if (!team) return c.json({ error: "not_found", message: "workspace not found" }, 404);
    const [storage, statuses, ownedTeams, links] = await Promise.all([
      usedBytes(id),
      prisma.task.groupBy({ by: ["status"], where: { teamId: id }, _count: { _all: true } }),
      prisma.team.count({ where: { ownerId: team.owner.id, kind: "team" } }),
      prisma.gitHubIssueLink.groupBy({
        by: ["status", "syncStatus"],
        where: { task: { teamId: id } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(statuses.map((row) => [row.status, row._count._all]));
    return c.json({
      checked_at: new Date().toISOString(),
      workspace: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        kind: team.kind,
        created_at: team.createdAt.toISOString(),
        owner: { id: team.owner.id, username: team.owner.username },
        plan: effectivePlan(team.owner),
        stripe_plan: team.owner.plan,
        plan_override: team.owner.planOverride,
        limits: supportCaps(team.owner),
        storage_bytes: storage,
        tasks: team._count.tasks,
        files: team._count.attachments,
        owner_team_count: ownedTeams,
        members: team.members.map((member) => ({
          id: member.user.id,
          username: member.user.username,
          role: member.role,
          joined_at: member.joinedAt.toISOString(),
        })),
        task_statuses: ["todo", "in_progress", "done", "canceled"].map((status) => ({
          status,
          count: counts.get(status) ?? 0,
        })),
        github: {
          owner_connection: team.owner.githubConnection
            ? {
                status: team.owner.githubConnection.status,
                verified_at: team.owner.githubConnection.verifiedAt.toISOString(),
              }
            : null,
          issue_links: links.map((row) => ({
            publication_status: row.status,
            sync_status: row.syncStatus,
            count: row._count._all,
          })),
        },
      },
    });
  }
);

adminSupportRoutes.get(
  "/billing",
  adminRequired,
  validate("query", adminBillingQuerySchema),
  async (c) => {
    const { page, q, status } = c.req.valid("query");
    const where = billingFilter(q, status);
    const [total, users, activeSubscriptions, grants, syncIssues] = await prisma.$transaction(
      [
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * ADMIN_PAGE_SIZE,
          take: ADMIN_PAGE_SIZE,
          select: {
            id: true,
            username: true,
            plan: true,
            planOverride: true,
            stripeCustomerId: true,
            periodEnd: true,
            graceUntil: true,
            billingStatus: true,
            billingCancelAtPeriodEnd: true,
            billingCancelAt: true,
            billingVerifiedAt: true,
            billingAttemptedAt: true,
            billingErrorCode: true,
            billingInvoiceStatus: true,
            billingInvoiceObservedAt: true,
          },
        }),
        prisma.user.count({ where: { AND: [where, { billingStatus: "active" }] } }),
        prisma.user.count({ where: { AND: [where, { planOverride: { not: null } }] } }),
        prisma.user.count({ where: { AND: [where, { billingErrorCode: { not: null } }] } }),
      ],
      { isolationLevel: "RepeatableRead" }
    );
    return c.json({
      page,
      page_size: ADMIN_PAGE_SIZE,
      total,
      configured: billingConfigured,
      summary: {
        accounts: total,
        active_subscriptions: activeSubscriptions,
        grants,
        sync_issues: syncIssues,
      },
      checked_at: new Date().toISOString(),
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        effective_plan: effectivePlan(user),
        stripe_plan: user.plan,
        operator_grant: user.planOverride,
        has_customer: user.stripeCustomerId !== null,
        subscription_status: user.billingStatus ?? "unknown",
        cancel_at_period_end: user.billingCancelAtPeriodEnd,
        cancel_at: user.billingCancelAt?.toISOString() ?? null,
        period_end: user.periodEnd?.toISOString() ?? null,
        grace_until: user.graceUntil?.toISOString() ?? null,
        verified_at: user.billingVerifiedAt?.toISOString() ?? null,
        attempted_at: user.billingAttemptedAt?.toISOString() ?? null,
        error_code: user.billingErrorCode ? safeMetricCode(user.billingErrorCode) : null,
        last_invoice_event: user.billingInvoiceStatus,
        invoice_observed_at: user.billingInvoiceObservedAt?.toISOString() ?? null,
      })),
    });
  }
);

adminSupportRoutes.get(
  "/billing/history",
  adminRequired,
  validate("query", adminSupportQuerySchema),
  async (c) => {
    const { page, q } = c.req.valid("query");
    const where: Prisma.BillingReconciliationEventWhereInput = q ? { user: userSearch(q) } : {};
    const [total, events] = await prisma.$transaction([
      prisma.billingReconciliationEvent.count({ where }),
      prisma.billingReconciliationEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: {
          id: true,
          source: true,
          outcome: true,
          errorCode: true,
          createdAt: true,
          user: { select: { id: true, username: true } },
        },
      }),
    ]);
    return c.json({
      page,
      page_size: ADMIN_PAGE_SIZE,
      total,
      events: events.map((event) => ({
        id: event.id,
        source: event.source,
        outcome: event.outcome,
        error_code: event.errorCode ? safeMetricCode(event.errorCode) : null,
        created_at: event.createdAt.toISOString(),
        user: event.user,
      })),
    });
  }
);
