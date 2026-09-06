import { prisma } from "../db.ts";

// PRD-11: one honest answer to "how many bytes does this workspace hold?" —
// task files PLUS the container logo. Every route that meters storage must come
// through here, or the logo quietly escapes the quota it is billed into.
export async function usedBytes(teamId: string): Promise<number> {
  const [files, team] = await Promise.all([
    prisma.attachment.aggregate({ where: { teamId }, _sum: { sizeBytes: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { logoBytes: true } }),
  ]);
  return (files._sum.sizeBytes ?? 0) + (team?.logoBytes ?? 0);
}
