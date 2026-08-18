import { Hono } from "hono";
import { Prisma } from "@mokara/db/prisma/generated/client";
import { prisma } from "../db.ts";
import { createTeamSchema, inviteSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { slugify, ensureUniqueSlug } from "../lib/slug.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { toTeam, toTeamMember, toInvitation } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

const MAX_TEAM_MEMBERS = 3;

export const teamRoutes = new Hono<{ Variables: Vars }>();

teamRoutes.post("/", validate("json", createTeamSchema), async (c) => {
  const userId = c.get("userId");
  const { name } = c.req.valid("json");

  const slug = await ensureUniqueSlug(
    async (s) => {
      const found = await prisma.team.findUnique({ where: { slug: s }, select: { id: true } });
      return Boolean(found);
    },
    slugify(name),
  );

  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({
      data: { name, slug, ownerId: userId },
    });
    await tx.teamMember.create({
      data: { teamId: t.id, userId, role: "owner" },
    });
    return t;
  });

  return c.json({ team: toTeam(team) }, 201);
});

teamRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    include: { team: true },
    orderBy: { team: { createdAt: "desc" } },
  });
  return c.json({
    teams: rows.map((m) => ({ ...toTeam(m.team), role: m.role })),
  });
});

teamRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return c.json({ error: "not_found", message: "team not found" }, 404);
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { username: true, displayName: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const openInvites = await prisma.teamInvitation.findMany({
    where: { teamId, status: "pending", expiresAt: { gt: new Date() } },
    include: {
      team: { select: { name: true } },
      inviter: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    team: toTeam(team),
    role,
    members: members.map(toTeamMember),
    invitations: openInvites.map(toInvitation),
  });
});

teamRoutes.post("/:id/leave", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const t = await prisma.team.findUnique({
    where: { id: teamId },
    select: { ownerId: true },
  });
  if (!t) {
    return c.json({ error: "not_found", message: "team not found" }, 404);
  }

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json(
      { error: "not_member", message: "you are not a member of this team" },
      403,
    );
  }

  if (role === "owner") {
    const otherCount = await prisma.teamMember.count({
      where: { teamId, NOT: { userId } },
    });
    if (otherCount > 0) {
      return c.json(
        {
          error: "owner_must_transfer",
          message: "owner cannot leave while other members exist",
        },
        409,
      );
    }
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  });
  return c.body(null, 204);
});

teamRoutes.post(
  "/:id/invitations",
  validate("json", inviteSchema),
  async (c) => {
    const userId = c.get("userId");
    const username = c.get("username");
    const teamId = c.req.param("id")!;
    const { username: inviteeUsername } = c.req.valid("json");

    const role = await getTeamRole(userId, teamId);
    if (!role) {
      return c.json(
        { error: "forbidden", message: "not a member of this team" },
        403,
      );
    }
    if (inviteeUsername === username) {
      return c.json(
        { error: "cannot_invite_self", message: "cannot invite yourself" },
        400,
      );
    }

    const invitee = await prisma.user.findUnique({
      where: { username: inviteeUsername },
      select: { id: true },
    });
    if (!invitee) {
      return c.json(
        { error: "user_not_found", message: "no user with that username" },
        404,
      );
    }

    const alreadyMember = await prisma.teamMember.count({
      where: { teamId, userId: invitee.id },
    });
    if (alreadyMember > 0) {
      return c.json(
        { error: "already_member", message: "user is already a member" },
        409,
      );
    }

    const memberCount = await prisma.teamMember.count({ where: { teamId } });
    if (memberCount >= MAX_TEAM_MEMBERS) {
      return c.json(
        { error: "team_full", message: "team already has 3 members" },
        409,
      );
    }

    try {
      const inv = await prisma.teamInvitation.create({
        data: { teamId, inviterId: userId, inviteeUsername },
      });
      return c.json({ invitation: toInvitation(inv) }, 201);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        if (target.includes("team_invitations_team_pending_unique")) {
          return c.json(
            { error: "already_invited", message: "user already has a pending invitation" },
            409,
          );
        }
      }
      throw e;
    }
  },
);
