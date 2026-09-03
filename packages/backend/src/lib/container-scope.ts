import { prisma } from "../db.ts";
import { getTeamRole } from "./team-membership.ts";

// PRD-06 §6 permission matrix: scope "team" items exist only in team-kind
// containers and only the leader (owner) may create them. Personal-scope
// items are open to any member. This is the shared create-time gate; edit
// rights are checked per-route (creator or leader).

export type ScopeDenial = { status: 403 | 404; error: string; message: string };

export async function guardContainerScope(
  teamId: string,
  userId: string,
  scope: string,
  noun: "project" | "kpi"
): Promise<ScopeDenial | null> {
  if (scope !== "team") return null;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { kind: true } });
  if (!team) {
    return { status: 404, error: "not_found", message: "team not found" };
  }
  if (team.kind !== "team") {
    return {
      status: 403,
      error: "team_scope_forbidden",
      message: `team ${noun}s need a team — invite someone first`,
    };
  }
  if ((await getTeamRole(userId, teamId)) !== "owner") {
    return {
      status: 403,
      error: "owner_only",
      message: `only the team leader can create team ${noun}s`,
    };
  }
  return null;
}
