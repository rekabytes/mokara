// Team analytics (PRD-04 phase 2). Bucketing + cumulative running totals
// happen server-side over the team's full history, so the values at the
// left edge of any range window reflect the total up to that day — not
// a per-day count that drops to zero on quiet days.
import { Hono } from "hono";
import { prisma } from "../db.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toAnalytics, type AnalyticsSeriesItem } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

export const analyticsRoutes = new Hono<{ Variables: Vars }>();

function ymd(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function nextDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

analyticsRoutes.get("/teams/:id/analytics", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  // Membership gate: members only (matches /teams/:id/tasks).
  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  // Range: number of days back from today (the returned series always
  // ends today, so the chart's right edge is the current date). The
  // analytics page sends its trailing-window length. Accept any integer
  // 1–92; anything else falls back to 30.
  const rangeRaw = Number.parseInt(c.req.query("range") ?? "30", 10);
  const range = Number.isInteger(rangeRaw) && rangeRaw >= 1 ? Math.min(rangeRaw, 92) : 30;

  // Pull full history. Teams cap at 3 members and event volume is small;
  // slicing in SQL wouldn't earn anything meaningful.
  const events = await prisma.taskEvent.findMany({
    where: { teamId },
    select: { createdAt: true, fromStatus: true, toStatus: true },
    orderBy: { createdAt: "asc" },
  });

  // Build zero-filled daily buckets across the historical span
  // (single pass: oldest event day → today). Empty teams get a single
  // zero row for today.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const oldest = events[0] ? new Date(events[0].createdAt) : today;
  oldest.setUTCHours(0, 0, 0, 0);

  type Bucket = { created: number; in_progress: number; completed: number; canceled: number };
  const buckets = new Map<string, Bucket>();
  for (let d = oldest; d <= today; d = nextDay(d)) {
    buckets.set(ymd(d), { created: 0, in_progress: 0, completed: 0, canceled: 0 });
  }
  for (const e of events) {
    const k = ymd(e.createdAt);
    const b = buckets.get(k);
    if (!b) continue;
    if (e.fromStatus === null) b.created += 1;
    else if (e.toStatus === "in_progress") b.in_progress += 1;
    else if (e.toStatus === "done") b.completed += 1;
    else if (e.toStatus === "canceled") b.canceled += 1;
  }

  // Cumulative running totals across the full history, so the left edge
  // of any range window still reflects the total up to that day. The line
  // is therefore non-decreasing — quiet days carry forward, busy days
  // step up. No rolling average: cumulative is already smooth.
  const keys = [...buckets.keys()]; // ascending (insertion order)
  const fullSeries: AnalyticsSeriesItem[] = [];
  let cumCreated = 0;
  let cumInProgress = 0;
  let cumCompleted = 0;
  let cumCanceled = 0;
  for (const k of keys) {
    const b = buckets.get(k)!;
    cumCreated += b.created;
    cumInProgress += b.in_progress;
    cumCompleted += b.completed;
    cumCanceled += b.canceled;
    fullSeries.push({
      date: k,
      created: cumCreated,
      in_progress: cumInProgress,
      completed: cumCompleted,
      canceled: cumCanceled,
    });
  }

  // Slice to the last `range` days.
  const series = fullSeries.slice(-range);

  // Live totals from the current tasks table (not events).
  const grouped = await prisma.task.groupBy({
    by: ["status"],
    where: { teamId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = { todo: 0, in_progress: 0, done: 0, canceled: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  return c.json(
    toAnalytics({
      range,
      series,
      totals: {
        open: counts.todo,
        in_progress: counts.in_progress,
        completed: counts.done,
        canceled: counts.canceled,
      },
    })
  );
});

// Progress tracking (Gantt): per-task planned vs actual spans. Returns the
// team's non-canceled tasks that have a due date, with the real start time
// (first `in_progress` event — start dates are not user-entered), the
// completion time (latest `done` event) and the full due-date history.
analyticsRoutes.get("/teams/:id/progress", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const tasks = await prisma.task.findMany({
    where: { teamId, dueDate: { not: null }, status: { not: "canceled" } },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      dueDate: true,
      dueChanges: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Start = the task's first `in_progress` event (a task created straight
  // into in progress counts as started then too); completion = its latest
  // `done` event.
  const statusEvents = await prisma.taskEvent.findMany({
    where: {
      teamId,
      toStatus: { in: ["in_progress", "done"] },
      taskId: { in: tasks.map((t) => t.id) },
    },
    select: { taskId: true, toStatus: true, createdAt: true },
  });
  const startedAt = new Map<string, Date>();
  const completedAt = new Map<string, Date>();
  for (const e of statusEvents) {
    if (e.toStatus === "in_progress") {
      const cur = startedAt.get(e.taskId);
      if (!cur || e.createdAt < cur) startedAt.set(e.taskId, e.createdAt);
    } else {
      const cur = completedAt.get(e.taskId);
      if (!cur || e.createdAt > cur) completedAt.set(e.taskId, e.createdAt);
    }
  }

  return c.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      created_at: t.createdAt.toISOString(),
      started_at: startedAt.get(t.id)?.toISOString() ?? null,
      due_date: t.dueDate!.toISOString(),
      completed_at: completedAt.get(t.id)?.toISOString() ?? null,
      due_changes: t.dueChanges.map((ch) => ({
        from_due: ch.fromDue?.toISOString() ?? null,
        to_due: ch.toDue?.toISOString() ?? null,
        changed_at: ch.createdAt.toISOString(),
      })),
    })),
  });
});
