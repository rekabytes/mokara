import { Hono } from "hono";
import { prisma } from "../db.ts";
import { createKpiSchema, updateKpiSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toKpi } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

export const kpiRoutes = new Hono<{ Variables: Vars }>();

const LIST_INCLUDE = {
  owner: { select: { username: true } },
  _count: { select: { bindings: true } },
} as const;

// PRD-06 phase 3: weighted progress. KPI progress = Σ(weight × status
// fraction) ÷ Σ(weight) over the KPI's non-canceled bound tasks. Fractions
// are named constants so the in-progress credit is one-line tunable; canceled
// tasks drop out of both sums.
const STATUS_FRACTION: Record<string, number> = {
  todo: 0,
  in_progress: 0.5,
  done: 1,
};

kpiRoutes.get("/teams/:id/kpis/progress", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const kpis = await prisma.kpi.findMany({
    where: { teamId },
    include: {
      owner: { select: { username: true } },
      bindings: { include: { task: { select: { status: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({
    kpis: kpis.map((k) => {
      const live = k.bindings.filter((b) => b.task.status !== "canceled");
      const weightSum = live.reduce((s, b) => s + b.weight, 0);
      const credit = live.reduce((s, b) => s + b.weight * (STATUS_FRACTION[b.task.status] ?? 0), 0);
      return {
        id: k.id,
        name: k.name,
        owner_username: k.owner.username,
        task_count: live.length,
        weight_sum: weightSum,
        // 0–100; a KPI with no bindings reads as 0, never an empty state.
        progress: weightSum > 0 ? Math.round((credit / weightSum) * 100) : 0,
      };
    }),
  });
});

kpiRoutes.get("/teams/:id/kpis", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const kpis = await prisma.kpi.findMany({
    where: { teamId },
    include: LIST_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return c.json({ kpis: kpis.map((k) => toKpi(k, k._count.bindings)) });
});

kpiRoutes.post("/teams/:id/kpis", validate("json", createKpiSchema), async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const { name } = c.req.valid("json");

  const k = await prisma.kpi.create({
    data: { teamId, ownerId: userId, name },
    include: LIST_INCLUDE,
  });
  return c.json({ kpi: toKpi(k, 0) }, 201);
});

kpiRoutes.patch("/kpis/:id", validate("json", updateKpiSchema), async (c) => {
  const userId = c.get("userId");
  const k = await prisma.kpi.findUnique({ where: { id: c.req.param("id")! } });
  if (!k) {
    return c.json({ error: "not_found", message: "kpi not found" }, 404);
  }
  const role = await getTeamRole(userId, k.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (k.ownerId !== userId && role !== "owner") {
    return c.json({ error: "forbidden", message: "only the creator or leader can edit this" }, 403);
  }

  const patch = c.req.valid("json");
  const updated = await prisma.kpi.update({
    where: { id: k.id },
    data: patch.name !== undefined ? { name: patch.name } : {},
    include: LIST_INCLUDE,
  });
  return c.json({ kpi: toKpi(updated, updated._count.bindings) });
});

kpiRoutes.delete("/kpis/:id", async (c) => {
  const userId = c.get("userId");
  const k = await prisma.kpi.findUnique({
    where: { id: c.req.param("id")! },
    include: { _count: { select: { bindings: true } } },
  });
  if (!k) {
    return c.json({ error: "not_found", message: "kpi not found" }, 404);
  }
  const role = await getTeamRole(userId, k.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (k.ownerId !== userId && role !== "owner") {
    return c.json(
      { error: "forbidden", message: "only the creator or leader can delete this" },
      403
    );
  }

  // KPIs carry no archived flag — deleting one with bindings would silently
  // erase measured history, so it's refused instead (PRD-06 §5).
  if (k._count.bindings > 0) {
    return c.json(
      { error: "kpi_in_use", message: "tasks are still weighted toward this KPI" },
      409
    );
  }
  await prisma.kpi.delete({ where: { id: k.id } });
  return c.body(null, 204);
});
