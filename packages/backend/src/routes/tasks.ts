import { Hono } from "hono";
import { prisma } from "../db.ts";
import { createTaskSchema, updateTaskSchema, taskStatusSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toTask } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// Combines team-scoped (/teams/:id/tasks) and single-task (/tasks/:id) routes
// — they're under the same authed surface and share the membership helper.
export const taskRoutes = new Hono<{ Variables: Vars }>();

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
  });
  return c.json(tasks.map(toTask));
});

taskRoutes.post("/teams/:id/tasks", validate("json", createTaskSchema), async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const input = c.req.valid("json");
  const task = await prisma.task.create({
    data: {
      teamId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      dueDate: input.due_date ? new Date(input.due_date) : null,
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
  return c.json(toTask(task), 201);
});

taskRoutes.get("/tasks/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }
  return c.json(toTask(task));
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

  const task = await prisma.task.update({ where: { id: taskId }, data });

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

  return c.json(toTask(task));
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
  });
  return c.json(toTask(updated));
});
