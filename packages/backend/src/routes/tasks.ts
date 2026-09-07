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
import { purgeAttachmentObjects } from "./attachments.ts";
import { toTask, toTaskKpi } from "../lib/types.ts";
import { notify, regenerateDueSoonForTeam } from "../lib/notifications.ts";
import { publishToTeam } from "../lib/events.ts";
import { log } from "../lib/logger.ts";
import type { Vars } from "../middleware/auth.ts";

// Board events (2026-09-07): fire-and-forget publish to the team channel —
// a dropped publish costs a teammate one stale row until their next refetch,
// never a failed mutation (same posture as notify()). The payload is the
// SAME shaped task the HTTP response carries, so the browser can upsert it
// without a refetch or a second serialization path.
function publishTeam(teamId: string, event: string, data: unknown): void {
  publishToTeam(teamId, { event, data }).catch((e) =>
    log.error(`board event ${event} not published`, e)
  );
}

// Combines team-scoped (/teams/:id/tasks) and single-task (/tasks/:id) routes
// — they're under the same authed surface and share the membership helper.
export const taskRoutes = new Hono<{ Variables: Vars }>();

// Every task response carries its KPI bindings — the client replaces whole
// task objects after mutations, so a response without them would wipe the
// chips.
const TASK_INCLUDE = {
  kpiBindings: { include: { kpi: { select: { name: true } } } },
  creator: { select: { id: true, username: true, displayName: true } },
  assignee: { select: { id: true, username: true, displayName: true } },
  // PRD-11: the checklist rides along so a task response can replace the
  // client's copy without wiping it (same reason as creator/assignee).
  subtaskItems: true,
} as const;

type TaskWithBindings = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

// PRD-10: an assignee must be a member of the task's container — mirrors the
// binding rule that nothing points across containers. Clearing is always
// fine; the actor is never notified for their own assignment.
async function assigneeDenial(
  teamId: string,
  assigneeId: string | null
): Promise<{ error: string; message: string; status: 400 } | null> {
  if (!assigneeId) return null;
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: assigneeId } },
  });
  return member
    ? null
    : {
        error: "assignee_not_member",
        message: "assignee must be a member of this container",
        status: 400,
      };
}

function shape(t: TaskWithBindings) {
  return toTask(t, t.kpiBindings.map(toTaskKpi));
}

type Binding = TaskKpiBinding;

// Shared create/PUT checks (owner decision 2026-09-05): the actor may bind only
// their OWN KPIs — personal stays personal at binding time too. Per-task total
// ≤ 100 is counted over the FINAL set: on PUT the route preserves teammates'
// bindings and passes their weight in `othersWeight`, so the submitted set can
// never push the task over budget. No duplicate KPIs; every KPI must live in
// the task's own container (PRD-06 §7 — no cross-container binding).
async function bindingDenial(
  userId: string,
  teamId: string,
  kpis: Binding[],
  othersWeight = 0
): Promise<{ status: 400 | 403 | 404 | 409; error: string; message: string } | null> {
  if (new Set(kpis.map((k) => k.kpi_id)).size !== kpis.length) {
    return { status: 400, error: "invalid_input", message: "duplicate kpi_id" };
  }
  if (kpis.length > 0) {
    const rows = await prisma.kpi.findMany({
      where: { id: { in: kpis.map((k) => k.kpi_id) }, teamId },
      select: { id: true, ownerId: true },
    });
    if (rows.length !== kpis.length) {
      return {
        status: 404,
        error: "kpi_not_found",
        message: "one of those KPIs is not in this container",
      };
    }
    if (rows.some((r) => r.ownerId !== userId)) {
      return {
        status: 403,
        error: "kpi_not_owner",
        message: "you can only bind your own KPIs",
      };
    }
  }
  const total = kpis.reduce((s, k) => s + k.weight, 0) + othersWeight;
  if (total > 100) {
    return {
      status: 409,
      error: "kpi_weight_exceeded",
      message: "KPI weights must total 100% or less",
    };
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

// PRD-11 Phase 1.5: the due-soon set now lives in the notifications table
// (one row per matching task) and is regenerated by the hooks in
// lib/notifications.ts — no per-request recomputation. GET /notifications
// catches up on session start; mutations keep things tight between requests.

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
  const username = c.get("username");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const input = c.req.valid("json");

  // PRD-10: an assignee must be a member of this container — mirrors the
  // binding rule that nothing points across containers.
  const aDenial = await assigneeDenial(teamId, input.assignee_id ?? null);
  if (aDenial) {
    return c.json({ error: aDenial.error, message: aDenial.message }, aDenial.status);
  }

  if (input.project_id) {
    const denial = await projectDenial(teamId, input.project_id);
    if (denial) {
      return c.json({ error: denial.error, message: denial.message }, denial.status);
    }
  }
  const kpis = input.kpis ?? [];
  const bDenial = await bindingDenial(userId, teamId, kpis);
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
      creatorId: userId,
      assigneeId: input.assignee_id ?? null,
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

  // PRD-05 + PRD-10: creating a task with an assignee notifies them — never
  // the actor themselves.
  if (input.assignee_id && input.assignee_id !== userId) {
    await notify(input.assignee_id, "task_assigned", {
      actor_username: username,
      task_id: task.id,
      task_title: input.title,
      team_id: teamId,
    });
  }
  // PRD-11 §1.5: a new task can land in the team's due-soon set immediately
  // (member's first reaction is to the bell). Fire-and-forget — regeneration
  // is best-effort by design, like notify().
  void regenerateDueSoonForTeam(teamId);
  const createdResponse = shape(created!);
  publishTeam(teamId, "task_created", createdResponse);
  return c.json(createdResponse, 201);
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
  const username = c.get("username");
  const taskId = c.req.param("id")!;

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true, status: true, dueDate: true, title: true, assigneeId: true },
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
  if (patch.assignee_id !== undefined) {
    const aDenial = await assigneeDenial(existing.teamId, patch.assignee_id ?? null);
    if (aDenial) {
      return c.json({ error: aDenial.error, message: aDenial.message }, aDenial.status);
    }
    data.assigneeId = patch.assignee_id ?? null;
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    include: TASK_INCLUDE,
  });

  // PRD-05 + PRD-10: a NEW assignee (someone other than the actor) is
  // notified once — re-assigning to the same person is silent.
  if (
    patch.assignee_id !== undefined &&
    patch.assignee_id &&
    patch.assignee_id !== userId &&
    patch.assignee_id !== existing.assigneeId
  ) {
    await notify(patch.assignee_id, "task_assigned", {
      actor_username: username,
      task_id: taskId,
      task_title: patch.title ?? existing.title,
      team_id: existing.teamId,
    });
  }

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

  // PRD-11 §1.5: only the fields that move a task in or out of the due-soon
  // set warrant a regeneration. Title / description / priority / project
  // never affect membership in the set, so they don't trigger a regen — the
  // user has not asked for the unread badge to refresh on a rename.
  const dueSoonTouched =
    (patch.status !== undefined && patch.status !== existing.status) ||
    (patch.due_date !== undefined &&
      (patch.due_date ? new Date(patch.due_date).getTime() : null) !==
        (existing.dueDate ? existing.dueDate.getTime() : null)) ||
    (patch.assignee_id !== undefined && patch.assignee_id !== existing.assigneeId);
  if (dueSoonTouched) void regenerateDueSoonForTeam(existing.teamId);

  const patchResponse = shape(task);
  publishTeam(existing.teamId, "task_updated", patchResponse);
  return c.json(patchResponse);
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

  // Owner rule (2026-09-05): bindings on someone else's KPIs are frozen from
  // this actor — they survive the PUT untouched, and their weight counts
  // toward the ≤100 budget the submitted set must fit into.
  const existingBindings = await prisma.taskKpi.findMany({
    where: { taskId },
    include: { kpi: { select: { ownerId: true } } },
  });
  const othersWeight = existingBindings
    .filter((b) => b.kpi.ownerId !== userId)
    .reduce((s, b) => s + b.weight, 0);

  const denial = await bindingDenial(userId, existing.teamId, kpis, othersWeight);
  if (denial) {
    return c.json({ error: denial.error, message: denial.message }, denial.status);
  }

  // Replace only the actor's OWN bindings; teammates' stay exactly as they are.
  await prisma.$transaction([
    prisma.taskKpi.deleteMany({ where: { taskId, kpi: { ownerId: userId } } }),
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

  // PRD-11: the task's files AND its comments' files die with the task in the
  // database (cascade), but the buckets don't — collect their keys first and
  // clean up best-effort after (a leftover object is a billing leak, not a lie).
  const stored = await prisma.attachment.findMany({
    where: { OR: [{ taskId }, { comment: { taskId } }] },
    select: { storageKey: true },
  });
  await prisma.task.delete({ where: { id: taskId } });
  await purgeAttachmentObjects(stored.map((a) => a.storageKey));
  // PRD-11 §1.5: a deleted task is gone from the set, so the team's due-soon
  // rows need to lose their entry. Cascade only handles attachments here —
  // notifications don't reference tasks, so we sweep them ourselves.
  void regenerateDueSoonForTeam(existing.teamId);
  publishTeam(existing.teamId, "task_deleted", { id: taskId, team_id: existing.teamId });
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
  const flagResponse = shape(updated);
  publishTeam(existing.teamId, "task_updated", flagResponse);
  return c.json(flagResponse);
});
