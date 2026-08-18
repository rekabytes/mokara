import { Hono } from "hono";
import { Prisma } from "@mokara/db/prisma/generated/client";
import { prisma } from "../db.ts";
import { respondSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { toInvitation } from "../lib/types.ts";
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

invitationRoutes.post(
  "/:id/respond",
  validate("json", respondSchema),
  async (c) => {
    const userId = c.get("userId");
    const username = c.get("username");
    const invId = c.req.param("id")!;
    const { action } = c.req.valid("json");

    const inv = await prisma.teamInvitation.findUnique({
      where: { id: invId },
      select: { teamId: true, inviteeUsername: true, status: true, expiresAt: true },
    });
    if (!inv) {
      return c.json(
        { error: "not_found", message: "invitation not found" },
        404,
      );
    }
    if (inv.inviteeUsername !== username) {
      return c.json(
        { error: "forbidden", message: "this invitation is not for you" },
        403,
      );
    }
    if (inv.status !== "pending") {
      return c.json(
        { error: "already_responded", message: "invitation already responded to" },
        409,
      );
    }
    if (inv.expiresAt.getTime() <= Date.now()) {
      await prisma.teamInvitation.update({
        where: { id: invId },
        data: { status: "expired" },
      });
      return c.json(
        { error: "invite_expired", message: "invitation has expired" },
        409,
      );
    }

    if (action === "decline") {
      await prisma.teamInvitation.update({
        where: { id: invId },
        data: { status: "declined", respondedAt: new Date() },
      });
      return c.json({ invitation_id: invId, status: "declined" });
    }

    // accept — insert member + mark accepted. The team_full trigger
    // raises P0001 with message containing "team_full" if the cap is hit.
    try {
      await prisma.$transaction([
        prisma.teamMember.create({
          data: { teamId: inv.teamId, userId, role: "member" },
        }),
        prisma.teamInvitation.update({
          where: { id: invId },
          data: { status: "accepted", respondedAt: new Date() },
        }),
      ]);
    } catch (e) {
      // The trigger raises with ERRCODE P0001 / message "team_full". Prisma
      // surfaces this as a known request error; we match defensively on both
      // code and message in case the adapter wraps it differently.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ((e.meta as { code?: string } | undefined)?.code === "P0001" ||
          e.message.includes("team_full"))
      ) {
        return c.json(
          { error: "team_full", message: "team already has 3 members" },
          409,
        );
      }
      if (e instanceof Error && e.message.includes("team_full")) {
        return c.json(
          { error: "team_full", message: "team already has 3 members" },
          409,
        );
      }
      throw e;
    }

    return c.json({
      invitation_id: invId,
      status: "accepted",
      team_id: inv.teamId,
    });
  },
);
