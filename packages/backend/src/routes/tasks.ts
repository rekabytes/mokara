import { Hono } from "hono";
import { Prisma } from "@mokara/db/prisma/generated/client";
import { prisma } from "../db.ts";
import {
  createTaskSchema,
  updateTaskSchema,
  taskStatusSchema,
  taskKpisSchema,
  type TaskKpiBinding,
} from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toTask, toTaskKpi } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// Combines team-scoped (/teams/:id/tasks) and single-task (/tasks/:id) routes
// — they're under the same authed surface and share the membership helper.
export const taskRoutes = new Hono<{ Variables: Vars }>();

// Every task response carries its KPI bindings — the client replaces whole
// task objects after mutations, so a response without them would wipe the
// chips.
const TASK_INCLUDE = {
  kpiBindings: { include: { kpi: { select: { name: true } } } },
} as const;

type TaskWithBindings = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function shape(t: TaskWithBindings) {
  return toTask(t, t.kpiBindings.map(toTaskKpi));
}

type Binding = TaskKpiBinding;

// Shared create/PUT checks: per-task total ≤ 100, no duplicate KPIs, every
// KPI in the task's own container (PRD-06 §7 — no cross-container binding).
async function bindingDenial(
  teamId: string,
  kpis: Binding[]
): Promise<{ status: 400 | 404 | 409; error: string; message: string } | null> {
  const total = kpis.reduce((s, k) => s + k.weight, 0);
  if (total > 100) {
    return {
      status: 409,
      error: "kpi_weight_exceeded",
      message: "KPI weights must total 100% or less",
    };
  }
  if (new Set(kpis.map((k) => k.kpi_id)).size !== kpis.length) {
    return { status: 400, error: "invalid_input", message: "duplicate kpi_id" };
  }
  if (kpis.length > 0) {
    const found = await prisma.kpi.count({
      where: { id: { in: kpis.map((k) => k.kpi_id) }, teamId },
    });
    if (found !== kpis.length) {
      return {
        status: 404,
        error: "kpi_not_found",
        message: "one of those KPIs is not in this container",
      };
    }
  }
  return null;
}

// A task's project must exist in the same container and not be archived.
async function projectDenial(
  teamId: string,
  projectId: string
): Promise<{ status: 400 | 404; error: string; message: string } | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true, archived: true },
  });
  if (!p || p.teamId !== teamId) {
    return { status: 404, error: "not_found", message: "project not found" };
  }
  if (p.archived) {
    return { status: 400, error: "invalid_input", message: "project is archived" };
  }
  return null;
}

taskRoutes.get("/teams/:id/tasks", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const status = c.req.query("status");
  const parsedStatus = status ? taskStatusSchema.safeParse(status) : undefined;
  if (parsedStatus && !parsedStatus.success) {
    return c.json(
      { error: "invalid_status", message: "status must be one of: todo, in_progress, done" },
      400
    );
  }

  const tasks = await prisma.task.findMany({
    where: { teamId, ...(parsedStatus?.data ? { status: parsedStatus.data } : {}) },
    orderBy: { createdAt: "desc" },
    include: TASK_INCLUDE,
  });
  return c.json(tasks.map(shape));
});

taskRoutes.post("/teams/:id/tasks", validate("json", createTaskSchema), async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const input = c.req.valid("json");

  if (input.project_id) {
    const denial = await projectDenial(teamId, input.project_id);
    if (denial) {
      return c.json({ error: denial.error, message: denial.message }, denial.status);
    }
  }
  const kpis = input.kpis ?? [];
  const bDenial = await bindingDenial(teamId, kpis);
  if (bDenial) {
    return c.json({ error: bDenial.error, message: bDenial.message }, bDenial.status);
  }

  const task = await prisma.task.create({
    data: {
      teamId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      dueDate: input.due_date ? new Date(input.due_date) : null,
      projectId: input.project_id ?? null,
      kpiBindings: {
        createMany: { data: kpis.map((k) => ({ kpiId: k.kpi_id, weight: k.weight })) },
      },
    },
  });
  // Activity log: seed the creation event in the same transaction so the
  // event never outlives (or precedes) the task.
  await prisma.taskEvent.create({
    data: {
      teamId,
      taskId: task.id,
      actorId: userId,
      fromStatus: null,
      toStatus: task.status,
    },
  });
  const created = await prisma.task.findUnique({
    where: { id: task.id },
    include: TASK_INCLUDE,
  });
  return c.json(shape(created!), 201);
});

taskRoutes.get("/tasks/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
  if (!task) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }
  return c.json(shape(task));
});

taskRoutes.patch("/tasks/:id", validate("json", updateTaskSchema), async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true, status: true, dueDate: true },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, existing.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const patch = c.req.valid("json");
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.due_date !== undefined) {
    data.dueDate = patch.due_date ? new Date(patch.due_date) : null;
  }
  if (patch.project_id !== undefined) {
    if (patch.project_id) {
      const denial = await projectDenial(existing.teamId, patch.project_id);
      if (denial) {
        return c.json({ error: denial.error, message: denial.message }, denial.status);
      }
    }
    data.projectId = patch.project_id;
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    include: TASK_INCLUDE,
  });

  // Record the transition in the activity log only when the status actually
  // changes; this keeps the analytics series honest (one event per move).
  if (patch.status !== undefined && patch.status !== existing.status) {
    await prisma.taskEvent.create({
      data: {
        teamId: existing.teamId,
        taskId,
        actorId: userId,
        fromStatus: existing.status,
        toStatus: patch.status,
      },
    });
  }

  // Due-date history: log only real changes (set, cleared, or moved) so the
  // progress analytics can show deadline revisions like "extra time added".
  if (patch.due_date !== undefined) {
    const newDue = patch.due_date ? new Date(patch.due_date) : null;
    const oldTs = existing.dueDate?.getTime() ?? null;
    const newTs = newDue?.getTime() ?? null;
    if (oldTs !== newTs) {
      await prisma.taskDueChange.create({
        data: { taskId, fromDue: existing.dueDate, toDue: newDue, actorId: userId },
      });
    }
  }

  return c.json(shape(task));
});

// Replace a task's KPI bindings wholesale (drawer chip). Empty array clears.
taskRoutes.put("/tasks/:id/kpis", validate("json", taskKpisSchema), async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }
  const role = await getTeamRole(userId, existing.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const { kpis } = c.req.valid("json");
  const denial = await bindingDenial(existing.teamId, kpis);
  if (denial) {
    return c.json({ error: denial.error, message: denial.message }, denial.status);
  }

  await prisma.$transaction([
    prisma.taskKpi.deleteMany({ where: { taskId } }),
    ...(kpis.length
      ? [
          prisma.taskKpi.createMany({
            data: kpis.map((k) => ({ taskId, kpiId: k.kpi_id, weight: k.weight })),
          }),
        ]
      : []),
  ]);

  const updated = await prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
  return c.json(shape(updated!));
});

taskRoutes.delete("/tasks/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, existing.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  await prisma.task.delete({ where: { id: taskId } });
  return c.body(null, 204);
});

// Toggle the `flagged` state on a task. Single click flips true<->false.
taskRoutes.post("/tasks/:id/flag", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true, flagged: true },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, existing.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { flagged: !existing.flagged },
    include: TASK_INCLUDE,
  });
  return c.json(shape(updated));
});
