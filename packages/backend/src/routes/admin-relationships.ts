import { prisma } from "../db.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";
export const INVITATION_PAGE_SIZE = 25;
export type InvitationQuery = {
  invitation_page: number;
  invitation_status: "all" | "pending" | "accepted" | "declined" | "expired";
};
export function invitationFilter(
  where: Prisma.TeamInvitationWhereInput,
  status: InvitationQuery["invitation_status"],
  now: Date
): Prisma.TeamInvitationWhereInput {
  const filter: Prisma.TeamInvitationWhereInput =
    status === "all"
      ? {}
      : status === "pending"
        ? { status: "pending", expiresAt: { gt: now } }
        : status === "expired"
          ? { OR: [{ status: "expired" }, { status: "pending", expiresAt: { lte: now } }] }
          : { status };
  return { AND: [where, filter] };
}
/** Actual invitation records and current membership are distinct observations. */
export async function invitationHistory(
  where: Prisma.TeamInvitationWhereInput,
  query: InvitationQuery
) {
  const now = new Date(),
    filter = invitationFilter(where, query.invitation_status, now);
  const [total, rows] = await prisma.$transaction(
    [
      prisma.teamInvitation.count({ where: filter }),
      prisma.teamInvitation.findMany({
        where: filter,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.invitation_page - 1) * INVITATION_PAGE_SIZE,
        take: INVITATION_PAGE_SIZE,
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          respondedAt: true,
          inviter: { select: { id: true, username: true } },
          invitee: { select: { id: true, username: true } },
          team: {
            select: { id: true, name: true, owner: { select: { id: true, username: true } } },
          },
        },
      }),
    ],
    { isolationLevel: "RepeatableRead" }
  );
  const members = rows.length
    ? await prisma.teamMember.findMany({
        where: { OR: rows.map((row) => ({ teamId: row.team.id, userId: row.invitee.id })) },
        select: { teamId: true, userId: true },
      })
    : [];
  const current = new Set(members.map((member) => `${member.teamId}:${member.userId}`));
  return {
    total,
    page: query.invitation_page,
    page_size: INVITATION_PAGE_SIZE,
    status: query.invitation_status,
    items: rows.map((row) => ({
      id: row.id,
      workspace: { id: row.team.id, name: row.team.name },
      owner: row.team.owner,
      inviter: row.inviter,
      invitee: row.invitee,
      status: row.status === "pending" && row.expiresAt <= now ? "expired" : row.status,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      responded_at: row.respondedAt?.toISOString() ?? null,
      currently_member: current.has(`${row.team.id}:${row.invitee.id}`),
    })),
  };
}
export async function userMemberships(userId: string) {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: [{ joinedAt: "desc" }, { teamId: "asc" }],
    select: {
      role: true,
      joinedAt: true,
      team: { select: { id: true, name: true, owner: { select: { id: true, username: true } } } },
    },
  });
  return rows.map((row) => ({
    workspace: { id: row.team.id, name: row.team.name },
    owner: row.team.owner,
    role: row.role,
    joined_at: row.joinedAt.toISOString(),
  }));
}
