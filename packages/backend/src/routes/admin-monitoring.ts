import type { Prisma } from "@mokara/db/prisma/generated/client";
import packageInfo from "../../package.json" with { type: "json" };
import { prisma } from "../db.ts";
import { getRedis } from "../redis.ts";
import {
  env,
  storageConfigured,
  billingConfigured,
  checkoutConfigured,
  githubConfigured,
  githubWebhookConfigured,
} from "../env.ts";
import { effectivePlan, PLAN_IDS } from "../lib/plans.ts";
import { readOperationalMetrics, safeMetricCode } from "../lib/operational-metrics.ts";
import { GITHUB_USER_VERIFICATION_TTL_MS } from "../lib/github-repositories.ts";

export const ATTENTION_STALE_MS = 5 * 60_000;
export const ADMIN_PAGE_SIZE = 25;
export function attentionJobFilter(now: Date): Prisma.GitHubSyncJobWhereInput {
  return {
    completedAt: null,
    OR: [
      { lastErrorCode: { not: null } },
      { createdAt: { lt: new Date(now.getTime() - ATTENTION_STALE_MS) } },
    ],
  };
}

export function planDistribution(
  rows: { plan: string; planOverride: string | null; _count: { _all: number } }[]
) {
  const counts = { free: 0, starter: 0, pro: 0, ultra: 0 };
  for (const row of rows) counts[effectivePlan(row)] += row._count._all;
  return PLAN_IDS.map((plan) => ({ plan, count: counts[plan] }));
}

async function bounded<T>(operation: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Monitoring check timed out")), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probe(operation: () => Promise<unknown>) {
  const start = Date.now();
  try {
    await bounded(operation, 2000);
    return { status: "healthy", latency_ms: Date.now() - start };
  } catch {
    return { status: "unavailable", latency_ms: null };
  }
}

async function databaseSnapshot(now: Date) {
  const pending: Prisma.GitHubSyncJobWhereInput = { completedAt: null };
  const [
    users,
    signups,
    workspaces,
    tasks,
    statuses,
    files,
    logos,
    plans,
    grants,
    connections,
    repos,
    queued,
    retrying,
    stale,
    failedLinks,
    pausedLinks,
    expiredConnections,
    grace,
    oldest,
    synced,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60_000) } },
    }),
    prisma.team.count(),
    prisma.task.count(),
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.attachment.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.team.aggregate({ _sum: { logoBytes: true } }),
    prisma.user.groupBy({ by: ["plan", "planOverride"], _count: { _all: true } }),
    prisma.user.count({ where: { planOverride: { not: null } } }),
    prisma.gitHubAccountConnection.count({ where: { status: "active" } }),
    prisma.gitHubAccountRepository.count({
      where: {
        enabled: true,
        connection: { status: "active" },
        repository: { active: true, installation: { status: "active" } },
      },
    }),
    prisma.gitHubSyncJob.count({ where: pending }),
    prisma.gitHubSyncJob.count({ where: { ...pending, lastErrorCode: { not: null } } }),
    prisma.gitHubSyncJob.count({
      where: { ...pending, createdAt: { lt: new Date(now.getTime() - ATTENTION_STALE_MS) } },
    }),
    prisma.gitHubIssueLink.count({
      where: { OR: [{ status: "failed" }, { syncStatus: "failed" }] },
    }),
    prisma.gitHubIssueLink.count({ where: { status: "linked", syncStatus: "paused" } }),
    prisma.gitHubAccountConnection.count({
      where: {
        status: "active",
        verifiedAt: { lt: new Date(now.getTime() - GITHUB_USER_VERIFICATION_TTL_MS) },
      },
    }),
    prisma.user.count({ where: { graceUntil: { not: null } } }),
    prisma.gitHubSyncJob.findFirst({
      where: pending,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true },
    }),
    prisma.gitHubIssueLink.aggregate({ _max: { lastSyncedAt: true } }),
  ]);
  const statusCounts = new Map(statuses.map((row) => [row.status, row._count._all]));
  return {
    usage: {
      users,
      signups_7d: signups,
      workspaces,
      tasks,
      attachments: files._count._all,
      storage_bytes: (files._sum.sizeBytes ?? 0) + (logos._sum.logoBytes ?? 0),
      task_statuses: ["todo", "in_progress", "done", "canceled"].map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
      plans: planDistribution(plans),
      operator_grants: grants,
    },
    github: {
      connections,
      active_repository_associations: repos,
      queued,
      retrying,
      pending_over_5m: stale,
      failed_links: failedLinks,
      paused_links: pausedLinks,
      expired_connections: expiredConnections,
      oldest_pending_at: oldest?.createdAt.toISOString() ?? null,
      last_synced_at: synced._max.lastSyncedAt?.toISOString() ?? null,
    },
    billing: { accounts_in_grace: grace },
  };
}

export async function monitoringOverview() {
  const now = new Date();
  const [database, redis] = await Promise.all([
    probe(() => prisma.$queryRaw`SELECT 1`),
    probe(() => getRedis().ping()),
  ]);
  const [snapshot, metrics] = await Promise.all([
    database.status === "healthy" ? bounded(() => databaseSnapshot(now)).catch(() => null) : null,
    redis.status === "healthy"
      ? bounded(() => readOperationalMetrics(now.getTime())).catch(() => null)
      : null,
  ]);
  return {
    checked_at: now.toISOString(),
    version: packageInfo.version,
    deploy_mode: env.DEPLOY_MODE,
    uptime_seconds: Math.floor(process.uptime()),
    health: {
      database,
      redis,
      storage: { status: storageConfigured ? "configured" : "not_configured", live_check: false },
      billing: {
        configured: billingConfigured,
        checkout_configured: checkoutConfigured,
        live_check: false,
      },
      github: {
        configured: githubConfigured,
        webhook_configured: githubWebhookConfigured,
        live_check: false,
      },
    },
    snapshot,
    metrics,
    attention: [
      {
        key: "api_errors",
        label: "API server errors (last 60 minute buckets)",
        count: metrics?.server_errors ?? null,
        href: null,
      },
      {
        key: "billing_webhooks",
        label: "Billing webhook failures (last 60 minute buckets)",
        count: metrics?.billing_failed ?? null,
        href: null,
      },
      {
        key: "github_retries",
        label: "GitHub jobs awaiting retry",
        count: snapshot?.github.retrying ?? null,
        href: "/attention",
      },
      {
        key: "github_stale",
        label: "GitHub jobs pending over 5 minutes",
        count: snapshot?.github.pending_over_5m ?? null,
        href: "/attention",
      },
      {
        key: "github_failed_links",
        label: "Failed GitHub publication or status sync",
        count: snapshot?.github.failed_links ?? null,
        href: "/users",
      },
      {
        key: "github_paused",
        label: "Paused GitHub issue links",
        count: snapshot?.github.paused_links ?? null,
        href: "/users",
      },
      {
        key: "github_verification",
        label: "GitHub connections needing reauthorization",
        count: snapshot?.github.expired_connections ?? null,
        href: "/users",
      },
      {
        key: "billing_grace",
        label: "Billing accounts with a grace flag (including expired)",
        count: snapshot?.billing.accounts_in_grace ?? null,
        href: "/users",
      },
    ],
  };
}

export async function attentionJobs(page: number) {
  const where = attentionJobFilter(new Date());
  const [total, jobs] = await prisma.$transaction([
    prisma.gitHubSyncJob.count({ where }),
    prisma.gitHubSyncJob.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        deliveryId: true,
        attempts: true,
        createdAt: true,
        availableAt: true,
        lockedUntil: true,
        lastErrorCode: true,
      },
    }),
  ]);
  return {
    page,
    page_size: ADMIN_PAGE_SIZE,
    total,
    jobs: jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      delivery_id: job.deliveryId,
      attempts: job.attempts,
      created_at: job.createdAt.toISOString(),
      retry_at: job.availableAt.toISOString(),
      locked_until: job.lockedUntil?.toISOString() ?? null,
      error_code: job.lastErrorCode === null ? null : safeMetricCode(job.lastErrorCode),
    })),
  };
}
