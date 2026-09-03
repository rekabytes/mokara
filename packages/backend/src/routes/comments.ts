import { Hono } from "hono";
import { prisma } from "../db.ts";
import { commentSchema, createCommentSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toComment } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// Task comments (PRD-03). List/create hang off the task; edit/delete hang off
// the comment itself. All reads/writes require membership in the task's team;
// edit/delete additionally require the requester to be the comment's author.
export const commentRoutes = new Hono<{ Variables: Vars }>();

const authorInclude = {
  author: { select: { id: true, username: true, displayName: true, createdAt: true } },
} as const;

commentRoutes.get("/tasks/:id/comments", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true },
  });
  if (!task) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    include: authorInclude,
    orderBy: { createdAt: "asc" },
  });
  return c.json({ comments: comments.map(toComment) });
});

commentRoutes.post("/tasks/:id/comments", validate("json", createCommentSchema), async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { teamId: true },
  });
  if (!task) {
    return c.json({ error: "not_found", message: "task not found" }, 404);
  }

  const role = await getTeamRole(userId, task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const input = c.req.valid("json");

  // Reply target must exist on THIS task. Threading is one level deep: a
  // reply to a reply attaches to the thread root instead.
  let parentId = input.parent_id ?? null;
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { taskId: true, parentId: true },
    });
    if (!parent || parent.taskId !== taskId) {
      return c.json(
        { error: "invalid_input", message: "parent comment not found on this task" },
        400
      );
    }
    if (parent.parentId) parentId = parent.parentId;
  }

  const comment = await prisma.comment.create({
    data: { taskId, authorId: userId, parentId, body: input.body },
    include: authorInclude,
  });
  return c.json({ comment: toComment(comment) }, 201);
});

commentRoutes.patch("/comments/:id", validate("json", commentSchema), async (c) => {
  const userId = c.get("userId");
  const commentId = c.req.param("id")!;

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { teamId: true } } },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "comment not found" }, 404);
  }

  const role = await getTeamRole(userId, existing.task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }
  if (existing.authorId !== userId) {
    return c.json({ error: "forbidden", message: "you can only edit your own comments" }, 403);
  }

  const input = c.req.valid("json");
  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: { body: input.body },
    include: authorInclude,
  });
  return c.json({ comment: toComment(comment) });
});

commentRoutes.delete("/comments/:id", async (c) => {
  const userId = c.get("userId");
  const commentId = c.req.param("id")!;

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { teamId: true } } },
  });
  if (!existing) {
    return c.json({ error: "not_found", message: "comment not found" }, 404);
  }

  const role = await getTeamRole(userId, existing.task.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }
  if (existing.authorId !== userId) {
    return c.json({ error: "forbidden", message: "you can only delete your own comments" }, 403);
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return c.body(null, 204);
});
