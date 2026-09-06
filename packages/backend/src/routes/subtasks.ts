import { Hono } from "hono";
import { prisma } from "../db.ts";
import {
  createSubtaskSchema,
  orderSubtasksSchema,
  updateSubtaskSchema,
} from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toSubtask } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-11 Phase 1.2: the checklist inside a task. Mutations hang off the item
// (PATCH/DELETE /subtasks/:id) or the task (POST, PUT order); there is no list
// endpoint because the checklist is EMBEDDED in every task response — the
// drawer renders the array it was already given, exactly like creator/assignee.
//
// Authorisation is MEMBERSHIP only, not author-only like comments: a checklist
// is task content, and anyone who may edit the task's title or description may
// tick its boxes. That is also why items carry no author — there is no
// ownership claim to enforce or display.
export const subtaskRoutes = new Hono<{ Variables: Vars }>();

type TaskGate =
  { ok: true; teamId: string } | { ok: false; status: 403 | 404; error: string; message: string };

// Existence first (404), then membership (403) — the order routes/tasks.ts uses
// for task-keyed paths.
async function gateTask(taskId: string, userId: string): Promise<TaskGate> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { teamId: true } });
  if (!task) {
    return { ok: false, status: 404, error: "not_found", message: "task not found" };
  }
  if (!(await getTeamRole(userId, task.teamId))) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "not a member of this task's team",
    };
  }
  return { ok: true, teamId: task.teamId };
}

// Same gate, reached from an item id instead of a task id.
async function gateSubtask(subtaskId: string, userId: string): Promise<TaskGate> {
  const item = await prisma.subtaskItem.findUnique({
    where: { id: subtaskId },
    select: { task: { select: { teamId: true } } },
  });
  if (!item) {
    return { ok: false, status: 404, error: "not_found", message: "subtask not found" };
  }
  return gateTaskByTeam(item.task.teamId, userId);
}

async function gateTaskByTeam(teamId: string, userId: string): Promise<TaskGate> {
  if (!(await getTeamRole(userId, teamId))) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "not a member of this task's team",
    };
  }
  return { ok: true, teamId };
}

subtaskRoutes.post("/tasks/:id/subtasks", validate("json", createSubtaskSchema), async (c) => {
  const taskId = c.req.param("id")!;
  const gate = await gateTask(taskId, c.get("userId"));
  if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, gate.status);

  // Appends: one past the current length. Positions are dense (the order route
  // rewrites 0..n-1), so count is always the next free slot.
  const position = await prisma.subtaskItem.count({ where: { taskId } });
  const item = await prisma.subtaskItem.create({
    data: { taskId, title: c.req.valid("json").title, position },
  });
  return c.json({ subtask: toSubtask(item) }, 201);
});

subtaskRoutes.patch("/subtasks/:id", validate("json", updateSubtaskSchema), async (c) => {
  const gate = await gateSubtask(c.req.param("id")!, c.get("userId"));
  if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, gate.status);

  const patch = c.req.valid("json");
  const data: { title?: string; done?: boolean } = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.done !== undefined) data.done = patch.done;
  if (Object.keys(data).length === 0) {
    return c.json({ error: "invalid_input", message: "nothing to update" }, 400);
  }

  const item = await prisma.subtaskItem.update({
    where: { id: c.req.param("id")! },
    data,
  });
  return c.json({ subtask: toSubtask(item) });
});

subtaskRoutes.delete("/subtasks/:id", async (c) => {
  const gate = await gateSubtask(c.req.param("id")!, c.get("userId"));
  if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, gate.status);

  await prisma.subtaskItem.delete({ where: { id: c.req.param("id")! } });
  return c.body(null, 204);
});

// Whole-list reorder: the client sends every id in the order it drew them.
// A partial list is refused rather than guessed at — silently keeping the
// omitted items' positions would reshuffle the rest by accident.
subtaskRoutes.put("/tasks/:id/subtasks/order", validate("json", orderSubtasksSchema), async (c) => {
  const taskId = c.req.param("id")!;
  const gate = await gateTask(taskId, c.get("userId"));
  if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, gate.status);

  const { ids } = c.req.valid("json");
  const owned = await prisma.subtaskItem.count({ where: { taskId, id: { in: ids } } });
  if (owned !== new Set(ids).size) {
    return c.json(
      { error: "invalid_input", message: "every subtask must belong to this task" },
      400
    );
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.subtaskItem.update({ where: { id }, data: { position: index } }))
  );
  return c.body(null, 204);
});
