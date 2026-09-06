import { Hono } from "hono";
import { isUniqueViolation } from "../lib/db-error.ts";
import { prisma } from "../db.ts";
import { createTeamSchema, inviteSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import { slugify, ensureUniqueSlug } from "../lib/slug.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import {
  joinDenial,
  limitsOfUser,
  memberLimitForPlan,
  teamCountDenial,
} from "../lib/entitlements.ts";
import { publicCap } from "../lib/plans.ts";
import { limitsOfTeam } from "../lib/entitlements.ts";
import { usedBytes } from "../lib/quota.ts";
import {
  deleteObject,
  getObjectBytes,
  putObject,
  storageReady,
  teamLogoKey,
} from "../lib/storage.ts";
import { toTeam, toTeamMember, toInvitation } from "../lib/types.ts";
import { notify } from "../lib/notifications.ts";
import type { Vars } from "../middleware/auth.ts";

export const teamRoutes = new Hono<{ Variables: Vars }>();

// One team object for a mutation response: the row plus the two derived numbers
// the client renders beside it (member count, and that count's cap).
async function teamPayload(teamId: string) {
  const [team, members] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      include: { owner: { select: { plan: true } } },
    }),
    prisma.teamMember.count({ where: { teamId } }),
  ]);
  return team ? toTeam(team, members, memberLimitForPlan(team.owner.plan)) : null;
}

teamRoutes.post("/", validate("json", createTeamSchema), async (c) => {
  const userId = c.get("userId");
  const { name, kind } = c.req.valid("json");

  // PRD-11: leading a TEAM container is the metered act (free = personal + 1).
  // Solo "workspace" containers stay uncapped — they hold one member, and
  // joinDenial() is what gates turning one into a team.
  if (kind === "team") {
    const denial = await teamCountDenial(userId);
    if (denial) {
      return c.json({ error: denial.error, message: denial.message }, denial.status);
    }
  }

  const slug = await ensureUniqueSlug(async (s) => {
    const found = await prisma.team.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(found);
  }, slugify(name));

  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({
      data: { name, slug, ownerId: userId, kind },
    });
    await tx.teamMember.create({
      data: { teamId: t.id, userId, role: "owner" },
    });
    return t;
  });

  // The creator is the leader, so the creator's plan is the team's cap.
  const limits = await limitsOfUser(userId);
  return c.json({ team: toTeam(team, 1, publicCap(limits.members)) }, 201);
});

teamRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    // The owner's plan rides along in the same join so member_limit costs no
    // extra query per row (PRD-11).
    include: { team: { include: { owner: { select: { plan: true } } } } },
    orderBy: { team: { createdAt: "desc" } },
  });
  // One grouped count for the whole list — the switcher needs member_count
  // to tell workspaces from teams without N queries.
  const counts = await prisma.teamMember.groupBy({
    by: ["teamId"],
    _count: { _all: true },
    where: { teamId: { in: rows.map((r) => r.teamId) } },
  });
  const countOf = new Map(counts.map((g) => [g.teamId, g._count._all]));
  // Owner (2026-09-06): the last-selected-container pointer rides the same
  // response the bootstrap reads — one round trip restores the pick. Filtered
  // against live membership here, so a team left (row still alive, FK not
  // fired) can never be restored; the client falls back to newest-first.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastContainerId: true },
  });
  const lastContainerId =
    me?.lastContainerId && rows.some((r) => r.teamId === me.lastContainerId)
      ? me.lastContainerId
      : null;
  return c.json({
    teams: rows.map((m) => ({
      ...toTeam(m.team, countOf.get(m.teamId) ?? 1, memberLimitForPlan(m.team.owner.plan)),
      role: m.role,
    })),
    last_container_id: lastContainerId,
  });
});

teamRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { owner: { select: { plan: true } } },
  });
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
    team: toTeam(team, members.length, memberLimitForPlan(team.owner.plan)),
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
    return c.json({ error: "not_member", message: "you are not a member of this team" }, 403);
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
        409
      );
    }
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  });
  return c.body(null, 204);
});

teamRoutes.post("/:id/invitations", validate("json", inviteSchema), async (c) => {
  const userId = c.get("userId");
  const username = c.get("username");
  const teamId = c.req.param("id")!;
  const { username: inviteeUsername } = c.req.valid("json");

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (inviteeUsername === username) {
    return c.json({ error: "cannot_invite_self", message: "cannot invite yourself" }, 400);
  }

  const invitee = await prisma.user.findUnique({
    where: { username: inviteeUsername },
    select: { id: true },
  });
  if (!invitee) {
    return c.json({ error: "user_not_found", message: "no user with that username" }, 404);
  }

  const alreadyMember = await prisma.teamMember.count({
    where: { teamId, userId: invitee.id },
  });
  if (alreadyMember > 0) {
    return c.json({ error: "already_member", message: "user is already a member" }, 409);
  }

  // PRD-11: the cap is the leader's plan, not a constant. This is the friendly
  // early answer; the accept route re-checks inside a transaction, which is
  // the race-safe gate the dropped Postgres trigger used to be.
  const denial = await joinDenial(prisma, teamId);
  if (denial) {
    return c.json({ error: denial.error, message: denial.message }, denial.status);
  }

  try {
    const inv = await prisma.teamInvitation.create({
      data: { teamId, inviterId: userId, inviteeUsername },
    });
    // PRD-05: tell the invitee (best-effort — see notify).
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
    await notify(invitee.id, "invitation", {
      actor_username: username,
      team_name: team?.name,
      team_id: teamId,
      invitation_id: inv.id,
    });
    return c.json({ invitation: toInvitation(inv) }, 201);
  } catch (e) {
    if (isUniqueViolation(e, "team_invitations_team_pending_unique")) {
      return c.json(
        { error: "already_invited", message: "user already has a pending invitation" },
        409
      );
    }
    throw e;
  }
});

// ---- PRD-11 Phase 1.4: the container logo -------------------------------
// Leader-only, image-only, one object per workspace (overwritten in place),
// and metered against the SAME storage quota as task files — a Starter perk
// must not be a way to store extra bytes for free.

teamRoutes.put("/:id/logo", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (role !== "owner") {
    return c.json(
      { error: "owner_only", message: "only the team leader can change the logo" },
      403
    );
  }
  if (!storageReady()) {
    return c.json(
      { error: "attachments_disabled", message: "this instance has no file storage configured" },
      409
    );
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: "invalid_input", message: "a file is required" }, 400);
  }
  // Images only: this renders in an <img> in the sidebar, so anything else is
  // either a mistake or an attempt to get bytes served under our own origin.
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "invalid_input", message: "the logo must be an image" }, 400);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { logoKey: true, logoBytes: true },
  });
  if (!team) return c.json({ error: "not_found", message: "team not found" }, 404);

  const limits = await limitsOfTeam(teamId);
  if (!limits) return c.json({ error: "not_found", message: "team not found" }, 404);
  if (file.size > limits.maxFileBytes) {
    return c.json(
      {
        error: "file_too_large",
        message: `that image is too large — ${Math.floor(limits.maxFileBytes / (1024 * 1024))} MB maximum per file on this plan`,
      },
      400
    );
  }
  // Replacing a logo frees its old bytes first, so the check is "everything
  // except the logo I am about to overwrite, plus the new image".
  const used = await usedBytes(teamId);
  const withoutLogo = used - (team.logoBytes ?? 0);
  if (withoutLogo + file.size > limits.storageBytes) {
    return c.json(
      {
        error: "quota_exceeded",
        message: `this workspace is out of storage — its plan allows ${Math.floor(limits.storageBytes / (1024 * 1024 * 1024))} GB`,
      },
      409
    );
  }

  const key = teamLogoKey(teamId);
  try {
    await putObject({
      key,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
    });
  } catch {
    return c.json(
      { error: "storage_unavailable", message: "file storage could not be reached — try again" },
      503
    );
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { logoKey: key, logoBytes: file.size, logoType: file.type },
  });
  const updated = await teamPayload(teamId);
  return c.json({ team: updated }, updated ? 200 : 500);
});

teamRoutes.delete("/:id/logo", async (c) => {
  const userId = c.get("userId");
  const teamId = c.req.param("id")!;

  const role = await getTeamRole(userId, teamId);
  if (!role) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }
  if (role !== "owner") {
    return c.json(
      { error: "owner_only", message: "only the team leader can change the logo" },
      403
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { logoKey: true } });
  if (!team) return c.json({ error: "not_found", message: "team not found" }, 404);

  await prisma.team.update({
    where: { id: teamId },
    data: { logoKey: null, logoBytes: null, logoType: null },
  });
  // Row cleared first: a leftover object is a billing nuisance, never a lie
  // the user can see. deleteObject already swallows and logs its own failures.
  if (team.logoKey) await deleteObject(team.logoKey);
  const updated = await teamPayload(teamId);
  return c.json({ team: updated }, updated ? 200 : 500);
});

teamRoutes.get("/:id/logo", async (c) => {
  const teamId = c.req.param("id")!;
  if (!storageReady()) return c.json({ error: "not_found", message: "no logo" }, 404);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { logoKey: true, logoType: true },
  });
  if (!team || !team.logoKey) {
    return c.json({ error: "not_found", message: "this team has no logo" }, 404);
  }
  // Anyone who can SEE the container can load its logo — the switcher renders
  // it for every member. A stranger still cannot: this is a cookie-authed route.
  if (!(await getTeamRole(c.get("userId"), teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this team" }, 403);
  }

  let bytes: { body: Uint8Array<ArrayBuffer>; contentType: string };
  try {
    bytes = await getObjectBytes(team.logoKey);
  } catch {
    return c.json(
      { error: "storage_unavailable", message: "file storage could not be reached — try again" },
      503
    );
  }
  return c.body(bytes.body, 200, {
    "Content-Type": team.logoType || bytes.contentType,
    "Content-Length": String(bytes.body.byteLength),
    // no-cache (not no-store): the browser may keep it but must revalidate, so a
    // replaced logo shows up on the next load instead of lurking for a session.
    "Cache-Control": "private, no-cache",
  });
});
