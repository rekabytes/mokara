import { Hono } from "hono";
import { prisma } from "../db.ts";
import { respondSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { joinDenial } from "../lib/entitlements.ts";
import { toInvitation } from "../lib/types.ts";
import { notify, markInvitationResponded, regenerateDueSoonForTeam } from "../lib/notifications.ts";
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

  // accept — the join gate (PRD-11 Phase 1.1). The enforce_max_team_members
  // trigger used to be the race-safe guard and it is gone (a trigger cannot see
  // the leader's plan), so the cap is now checked INSIDE this transaction after
  // locking the workspace row: two simultaneous accepts serialise on that lock
  // and the second sees the first one's member, exactly like the trigger did.
  // An over-cap answer commits an empty transaction - there is nothing to undo.
  const denial = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "teams" WHERE "id" = ${inv.teamId}::uuid FOR UPDATE`;

    const join = await joinDenial(tx, inv.teamId);
    if (join) return join;

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
    return null;
  });
  if (denial) {
    return c.json({ error: denial.error, message: denial.message }, denial.status);
  }

  await markInvitationResponded(userId, invId, "accepted");
  // PRD-05: tell the inviter their invitation was accepted (best-effort).
  const team = await prisma.team.findUnique({ where: { id: inv.teamId }, select: { name: true } });
  await notify(inv.inviterId, "invitation_accepted", {
    actor_username: username,
    team_name: team?.name,
    team_id: inv.teamId,
  });
  // PRD-11 §1.5: the new member's containers just gained a team — any
  // matching tasks there should appear in their drawer the next time it
  // opens, and the bell should bump if any are unread.
  void regenerateDueSoonForTeam(inv.teamId);

  return c.json({
    invitation_id: invId,
    status: "accepted",
    team_id: inv.teamId,
  });
});
