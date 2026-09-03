import { Hono } from "hono";
import { prisma } from "../db.ts";
import { createProjectSchema, updateProjectSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { guardContainerScope } from "../lib/container-scope.ts";
import { toProject, toTask } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

export const projectRoutes = new Hono<{ Variables: Vars }>();

// Tasks come back as statuses so the mapper can compute done/total per project.
const LIST_INCLUDE = {
  owner: { select: { username: true } },
  tasks: { select: { status: true } },
} as const;

projectRoutes.get("/teams/:id/projects", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  // Everyone in the container sees everything (PRD-06: visibility is not a
  // permission here); archived items hide unless ?all=1.
  const projects = await prisma.project.findMany({
    where: { teamId, ...(c.req.query("all") === "1" ? {} : { archived: false }) },
    include: LIST_INCLUDE,
    orderBy: [{ scope: "desc" }, { createdAt: "asc" }], // team layer first, then personal
  });
  return c.json({ projects: projects.map((p) => toProject(p)) });
});

projectRoutes.post("/teams/:id/projects", validate("json", createProjectSchema), async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const { name, color, scope } = c.req.valid("json");
  const denial = await guardContainerScope(teamId, userId, scope, "project");
  if (denial) {
    return c.json({ error: denial.error, message: denial.message }, denial.status);
  }

  const p = await prisma.project.create({
    data: { teamId, ownerId: userId, scope, name, color: color ?? null },
    include: LIST_INCLUDE,
  });
  return c.json({ project: toProject(p) }, 201);
});

async function loadProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: { ...LIST_INCLUDE, tasks: { orderBy: { createdAt: "desc" } } },
  });
}

projectRoutes.get("/projects/:id", async (c) => {
  const userId = c.get("userId");
  const p = await loadProject(c.req.param("id")!);
  if (!p) {
    return c.json({ error: "not_found", message: "project not found" }, 404);
  }
  const role = await getTeamRole(userId, p.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  return c.json({
    project: toProject(p),
    tasks: p.tasks.map((t) => toTask(t)),
  });
});

projectRoutes.patch("/projects/:id", validate("json", updateProjectSchema), async (c) => {
  const userId = c.get("userId");
  const p = await prisma.project.findUnique({ where: { id: c.req.param("id")! } });
  if (!p) {
    return c.json({ error: "not_found", message: "project not found" }, 404);
  }
  const role = await getTeamRole(userId, p.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  // Creator or team leader may edit; scope never changes after creation.
  if (p.ownerId !== userId && role !== "owner") {
    return c.json({ error: "forbidden", message: "only the creator or leader can edit this" }, 403);
  }

  const patch = c.req.valid("json");
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.archived !== undefined) data.archived = patch.archived;

  const updated = await prisma.project.update({ where: { id: p.id }, data, include: LIST_INCLUDE });
  return c.json({ project: toProject(updated) });
});

projectRoutes.delete("/projects/:id", async (c) => {
  const userId = c.get("userId");
  const p = await prisma.project.findUnique({ where: { id: c.req.param("id")! } });
  if (!p) {
    return c.json({ error: "not_found", message: "project not found" }, 404);
  }
  const role = await getTeamRole(userId, p.teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (p.ownerId !== userId && role !== "owner") {
    return c.json(
      { error: "forbidden", message: "only the creator or leader can delete this" },
      403
    );
  }

  // Bound tasks → archive (tasks fall back to no project only on unbind);
  // empty → hard delete. (PRD-06 ⚑ default.)
  const bound = await prisma.task.count({ where: { projectId: p.id } });
  if (bound > 0) {
    const archived = await prisma.project.update({
      where: { id: p.id },
      data: { archived: true },
      include: LIST_INCLUDE,
    });
    return c.json({ project: toProject(archived) });
  }
  await prisma.project.delete({ where: { id: p.id } });
  return c.body(null, 204);
});
