// Team analytics (PRD-04 phase 2). Bucketing + 7-day rolling averages
// happen server-side over the team's full history, so the values at the
// left edge of any range window are accurate, not truncated.
import { Hono } from "hono";
import { prisma } from "../db.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toAnalytics, type AnalyticsSeriesItem } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

export const analyticsRoutes = new Hono<{ Variables: Vars }>();

const ALLOWED_RANGES = [7, 30, 90] as const;

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

  // Range: accept only the documented buckets; coerce anything else to 30.
  const rangeRaw = Number.parseInt(c.req.query("range") ?? "30", 10);
  const range = (ALLOWED_RANGES as readonly number[]).includes(rangeRaw) ? rangeRaw : 30;

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

  // Trailing 7-day rolling averages, computed across full history so the
  // left edge of the output window has a real average (not "no data").
  const WINDOW = 7;
  const keys = [...buckets.keys()]; // ascending (insertion order)
  const fullSeries: AnalyticsSeriesItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const b = buckets.get(k)!;
    const start = Math.max(0, i - WINDOW + 1);
    let cC = 0,
      cP = 0,
      cD = 0,
      cX = 0;
    for (let j = start; j <= i; j++) {
      const bb = buckets.get(keys[j])!;
      cC += bb.created;
      cP += bb.in_progress;
      cD += bb.completed;
      cX += bb.canceled;
    }
    const n = i - start + 1; // 1..7 (≤7 days available at the boundary)
    fullSeries.push({
      date: k,
      created: b.created,
      in_progress: b.in_progress,
      completed: b.completed,
      canceled: b.canceled,
      created_avg: round2(cC / n),
      in_progress_avg: round2(cP / n),
      completed_avg: round2(cD / n),
      canceled_avg: round2(cX / n),
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
