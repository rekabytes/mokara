import { prisma } from "../db.ts";
import { isHosted } from "../env.ts";
import {
  effectivePlan,
  limitsForOwner,
  publicCap,
  UNLIMITED,
  type PeoplePlanHolder,
  type PlanLimits,
} from "./plans.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";

// PRD-11 Phase 1.1 - plan-aware caps. Deliberately the same shape as
// lib/container-scope.ts: plain ids in, `{ status, error, message } | null`
// out, no Hono Context (a standalone exported helper cannot carry the
// validated-json type through it). Callers do:
//   const d = await joinDenial(prisma, teamId, inviteeId);
//   if (d) return c.json({ error: d.error, message: d.message }, d.status);

export type EntitlementDenial = { status: 404 | 409; error: string; message: string };

/**
 * The limits that govern a workspace. A workspace's tier is its LEADER's plan
 * (Phase 0, §6.6) - never the actor's, because the person inviting is often
 * not the person paying. Returns null when the workspace does not exist so the
 * caller can answer its own 404.
 */
export async function limitsOfTeam(teamId: string): Promise<PlanLimits | null> {
  if (!isHosted) return UNLIMITED;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { owner: { select: { plan: true, planOverride: true, peoplePolicy: true } } },
  });
  if (!team) return null;
  return limitsForOwner(team.owner);
}

/** The limits that govern one account (how many teams it may lead, etc). */
export async function limitsOfUser(
  userId: string,
  client: Prisma.TransactionClient = prisma
): Promise<PlanLimits> {
  if (!isHosted) return UNLIMITED;
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { plan: true, planOverride: true, peoplePolicy: true },
  });
  return limitsForOwner(user ?? { plan: "free", planOverride: null, peoplePolicy: "account" });
}

/**
 * May one more member join this workspace? Checks the two things a join can
 * break at once:
 *
 *  1. Free's workspace cap or the paid owner's shared distinct-people cap, and
 *  2. the leader's TEAM-COUNT cap - a workspace-kind container promotes to
 *     "team" on its first accepted invite (PRD-06, one-way), so a join can
 *     silently create a team the leader is not entitled to. This is what keeps
 *     "personal + 1" honest when someone spawns private containers and fills
 *     them later.
 *
 * Both the invite route (friendly early 409) and the accept route (the real
 * gate, which additionally locks the owner, workspace and invitation) go through here. `client` is the
 * transaction client when called from the accept route, plain prisma otherwise.
 */
export async function joinDenial(
  client: Prisma.TransactionClient,
  teamId: string,
  inviteeId: string
): Promise<EntitlementDenial | null> {
  if (!isHosted) return null;

  const team = await client.team.findUnique({
    where: { id: teamId },
    select: {
      kind: true,
      ownerId: true,
      owner: { select: { plan: true, planOverride: true, peoplePolicy: true } },
    },
  });
  if (!team) return { status: 404, error: "not_found", message: "team not found" };

  const limits = limitsForOwner(team.owner);

  if (memberScopeForOwner(team.owner) === "account") {
    // Existing collaborators use no additional place, including after a downgrade.
    const existing =
      inviteeId === team.ownerId ||
      (await client.teamMember.count({
        where: { userId: inviteeId, team: { ownerId: team.ownerId } },
      })) > 0;
    if (!existing && (await peopleUsedByOwner(team.ownerId, client)) >= limits.members) {
      return {
        status: 409,
        error: "team_full",
        message: `The workspace owner's plan includes ${limits.members} unique people, including the owner, shared across all owned workspaces. Remove a person from every owned workspace or upgrade to add someone new.`,
      };
    }
  } else if ((await client.teamMember.count({ where: { teamId } })) + 1 > limits.members) {
    return {
      status: 409,
      error: "team_full",
      message: `this team is full - ${limits.members} members maximum on its plan`,
    };
  }

  // Only a promotion consumes a team slot; joining an existing team does not.
  if (team.kind !== "team") {
    const led = await client.team.count({ where: { ownerId: team.ownerId, kind: "team" } });
    if (led + 1 > limits.teams) {
      return {
        status: 409,
        error: "workspace_limit",
        message: `${limits.teams} team${limits.teams === 1 ? "" : "s"} maximum on this plan`,
      };
    }
  }

  return null;
}

/** Count identities, not memberships; the owner always occupies one place. */
export async function peopleUsedByOwner(
  ownerId: string,
  client: Prisma.TransactionClient = prisma
): Promise<number> {
  const rows = await client.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT ${ownerId}::uuid AS user_id
      UNION
      SELECT tm.user_id FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE t.owner_id = ${ownerId}::uuid
    ) people`;
  return rows[0]?.count ?? 1;
}

export function memberScopeForOwner(owner: PeoplePlanHolder): "account" | "workspace" {
  return isHosted && owner.peoplePolicy !== "legacy" && effectivePlan(owner) !== "free"
    ? "account"
    : "workspace";
}

/**
 * May this account create one more TEAM container? Solo "workspace"
 * containers are uncapped by design: they hold one member, cost nothing, and
 * the join check above is what gates turning one into a team.
 */
export async function teamCountDenial(
  userId: string,
  client: Prisma.TransactionClient = prisma
): Promise<EntitlementDenial | null> {
  if (!isHosted) return null;
  const limits = await limitsOfUser(userId, client);
  const led = await client.team.count({ where: { ownerId: userId, kind: "team" } });
  if (led + 1 > limits.teams) {
    return {
      status: 409,
      error: "workspace_limit",
      message: `your plan leads ${limits.teams} team${limits.teams === 1 ? "" : "s"} - that is the maximum`,
    };
  }
  return null;
}

/**
 * member_limit as the client sees it (a number, null for "no cap") - straight
 * from the leader's TWO plan columns, so routes that already joined the owner
 * answer for a whole list in one query instead of one per row.
 *
 * Takes the holder rather than a plan string on purpose: a caller that selected
 * only `plan` cannot compile. That is the guard against this repo's known trap —
 * a grant enforced in one place and displayed in another.
 *
 * DEPLOY_MODE applies here too, not just to enforcement: a self-hosted
 * instance adds members freely, so printing the plan's number would advertise a
 * limit that nothing enforces. The UI renders a bare count for null.
 */
export function memberLimitForOwner(owner: PeoplePlanHolder): number | null {
  if (!isHosted) return null;
  return publicCap(limitsForOwner(owner).members);
}
