import { prisma } from "../db.ts";

export async function getTeamRole(userId: string, teamId: string): Promise<string | null> {
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}
