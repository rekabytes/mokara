import { Hono } from "hono";
import { prisma } from "../db.ts";
import { isTeamFull } from "../lib/db-error.ts";
import { respondSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { toInvitation } from "../lib/types.ts";
import { notify, markInvitationResponded } from "../lib/notifications.ts";
import type { Vars } from "../middleware/auth.ts";

export const invitationRoutes = new Hono<{ Variables: Vars }>();

invitationRoutes.get("/", async (c) => {
  const username = c.get("username");
  const rows = await prisma.teamInvitation.findMany({
    where: {
      inviteeUsername: username,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: {
      team: { select: { name: true } },
      inviter: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ invitations: rows.map(toInvitation) });
});

invitationRoutes.post("/:id/respond", validate("json", respondSchema), async (c) => {
  const userId = c.get("userId");
  const username = c.get("username");
  const invId = c.req.param("id")!;
  const { action } = c.req.valid("json");

  const inv = await prisma.teamInvitation.findUnique({
    where: { id: invId },
    select: { teamId: true, inviteeUsername: true, status: true, expiresAt: true, inviterId: true },
  });
  if (!inv) {
    return c.json({ error: "not_found", message: "invitation not found" }, 404);
  }
  if (inv.inviteeUsername !== username) {
    return c.json({ error: "forbidden", message: "this invitation is not for you" }, 403);
  }
  if (inv.status !== "pending") {
    return c.json({ error: "already_responded", message: "invitation already responded to" }, 409);
  }
  if (inv.expiresAt.getTime() <= Date.now()) {
    await prisma.teamInvitation.update({
      where: { id: invId },
      data: { status: "expired" },
    });
    return c.json({ error: "invite_expired", message: "invitation has expired" }, 409);
  }

  if (action === "decline") {
    await prisma.teamInvitation.update({
      where: { id: invId },
      data: { status: "declined", respondedAt: new Date() },
    });
    await markInvitationResponded(userId, invId, "declined");
    return c.json({ invitation_id: invId, status: "declined" });
  }

  // accept — insert member + mark accepted. The team_full trigger
  // raises P0001 with message containing "team_full" if the cap is hit.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.teamMember.create({
        data: { teamId: inv.teamId, userId, role: "member" },
      });
      await tx.teamInvitation.update({
        where: { id: invId },
        data: { status: "accepted", respondedAt: new Date() },
      });
      // PRD-06: the first ACCEPTED invitation promotes the container —
      // one-way, a team never reverts to a workspace.
      await tx.team.update({ where: { id: inv.teamId }, data: { kind: "team" } });
    });
  } catch (e) {
    // The enforce_max_team_members trigger raises 'team_full'; db-error.ts
    // explains why the raw Prisma message can't be matched directly.
    if (isTeamFull(e)) {
      return c.json({ error: "team_full", message: "team already has 3 members" }, 409);
    }
    throw e;
  }

  await markInvitationResponded(userId, invId, "accepted");
  // PRD-05: tell the inviter their invitation was accepted (best-effort).
  const team = await prisma.team.findUnique({ where: { id: inv.teamId }, select: { name: true } });
  await notify(inv.inviterId, "invitation_accepted", {
    actor_username: username,
    team_name: team?.name,
    team_id: inv.teamId,
  });

  return c.json({
    invitation_id: invId,
    status: "accepted",
    team_id: inv.teamId,
  });
});
