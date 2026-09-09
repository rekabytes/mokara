import { prisma } from "../db.ts";
import { isHosted } from "../env.ts";
import {
  effectivePlan,
  limitsFor,
  publicCap,
  UNLIMITED,
  type PlanHolder,
  type PlanLimits,
} from "./plans.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";

// PRD-11 Phase 1.1 - plan-aware caps. Deliberately the same shape as
// lib/container-scope.ts: plain ids in, `{ status, error, message } | null`
// out, no Hono Context (a standalone exported helper cannot carry the
// validated-json type through it). Callers do:
//   const d = await joinDenial(prisma, teamId);
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
    select: { owner: { select: { plan: true, planOverride: true } } },
  });
  if (!team) return null;
  return limitsFor(effectivePlan(team.owner));
}

/** The limits that govern one account (how many teams it may lead, etc). */
export async function limitsOfUser(userId: string): Promise<PlanLimits> {
  if (!isHosted) return UNLIMITED;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planOverride: true },
  });
  return limitsFor(effectivePlan(user ?? { plan: "free", planOverride: null }));
}

/**
 * May one more member join this workspace? Checks the two things a join can
 * break at once:
 *
 *  1. the member cap of the leader's plan, and
 *  2. the leader's TEAM-COUNT cap - a workspace-kind container promotes to
 *     "team" on its first accepted invite (PRD-06, one-way), so a join can
 *     silently create a team the leader is not entitled to. This is what keeps
 *     "personal + 1" honest when someone spawns private containers and fills
 *     them later.
 *
 * Both the invite route (friendly early 409) and the accept route (the real
 * gate, which additionally takes a row lock) go through here. `client` is the
 * transaction client when called from the accept route, plain prisma otherwise.
 */
export async function joinDenial(
  client: Prisma.TransactionClient,
  teamId: string
): Promise<EntitlementDenial | null> {
  if (!isHosted) return null;

  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { kind: true, ownerId: true, owner: { select: { plan: true, planOverride: true } } },
  });
  if (!team) return { status: 404, error: "not_found", message: "team not found" };

  const limits = limitsFor(effectivePlan(team.owner));

  const members = await client.teamMember.count({ where: { teamId } });
  if (members + 1 > limits.members) {
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

/**
 * May this account create one more TEAM container? Solo "workspace"
 * containers are uncapped by design: they hold one member, cost nothing, and
 * the join check above is what gates turning one into a team.
 */
export async function teamCountDenial(userId: string): Promise<EntitlementDenial | null> {
  if (!isHosted) return null;
  const limits = await limitsOfUser(userId);
  const led = await prisma.team.count({ where: { ownerId: userId, kind: "team" } });
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
export function memberLimitForOwner(owner: PlanHolder): number | null {
  if (!isHosted) return null;
  return publicCap(limitsFor(effectivePlan(owner)).members);
}
