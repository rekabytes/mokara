import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
const OWNER = randomUUID(),
  A = randomUUID(),
  B = randomUUID(),
  FOREIGN = randomUUID();
let state;
const people = (owner) =>
  new Set([
    owner,
    ...state.members
      .filter((m) => state.teams.get(m.teamId).ownerId === owner)
      .map((m) => m.userId),
  ]);
const prisma = {
  team: {
    findUnique: async ({ where }) => {
      const team = state.teams.get(where.id);
      return team ? { ...team, owner: { ...state.owner } } : null;
    },
    count: async ({ where }) =>
      [...state.teams.values()].filter((t) => t.ownerId === where.ownerId && t.kind === where.kind)
        .length,
    update: async ({ where, data }) => Object.assign(state.teams.get(where.id), data),
  },
  teamMember: {
    count: async ({ where }) =>
      state.members.filter(
        (m) =>
          (!where.teamId || m.teamId === where.teamId) &&
          (!where.userId || m.userId === where.userId) &&
          (!where.team || state.teams.get(m.teamId).ownerId === where.team.ownerId)
      ).length,
    create: async ({ data }) => {
      state.members.push(data);
      return data;
    },
  },
  teamInvitation: {
    findUnique: async ({ where }) => structuredClone(state.invites.get(where.id) ?? null),
    update: async ({ where, data }) => Object.assign(state.invites.get(where.id), data),
  },
  $queryRaw: async (_sql, owner) => [{ count: people(owner).size }],
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    let release;
    const tx = {
      ...prisma,
      $queryRaw: async (sql, owner) => {
        if (!sql.join("").includes("FOR UPDATE")) return prisma.$queryRaw(sql, owner);
        assert.equal(owner, OWNER);
        const previous = state.lock;
        state.lock = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        state.locks.push("owner");
        state.afterOwnerLock?.();
        return [{ id: owner }];
      },
      $executeRaw: async (sql) => {
        assert.ok(release, "owner locked first");
        state.locks.push(sql.join("").includes("team_invitations") ? "invitation" : "team");
      },
    };
    try {
      return await operation(tx);
    } finally {
      release?.();
    }
  },
};
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/env.ts", { namedExports: { isHosted: true } });
mock.module("../src/lib/notifications.ts", {
  namedExports: {
    notify: async () => {},
    markInvitationResponded: async () => {},
    regenerateDueSoonForTeam: async () => {},
  },
});
const { joinDenial, peopleUsedByOwner, memberScopeForOwner } =
  await import("../src/lib/entitlements.ts");
const { limitsFor } = await import("../src/lib/plans.ts");
const { invitationRoutes } = await import("../src/routes/invitations.ts");
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("userId", c.req.header("x-user"));
  c.set("username", c.req.header("x-user"));
  await next();
});
app.route("/invitations", invitationRoutes);
beforeEach(() => {
  state = {
    owner: { plan: "starter", planOverride: null, peoplePolicy: "account" },
    teams: new Map([
      [A, { ownerId: OWNER, kind: "team", name: "A" }],
      [B, { ownerId: OWNER, kind: "team", name: "B" }],
      [FOREIGN, { ownerId: randomUUID(), kind: "team" }],
    ]),
    members: [],
    invites: new Map(),
    locks: [],
    lock: Promise.resolve(),
  };
});
function fill(count) {
  state.members = Array.from({ length: count - 1 }, () => ({ teamId: A, userId: randomUUID() }));
}
function invite(teamId, userId) {
  const id = randomUUID();
  state.invites.set(id, {
    id,
    teamId,
    inviteeUsername: userId,
    inviterId: OWNER,
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
  });
  return id;
}
function accept(id, userId) {
  return app.request(`/invitations/${id}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user": userId },
    body: JSON.stringify({ action: "accept" }),
  });
}
test("paid capacity is shared across owned workspaces, with the owner included even without membership rows", async () => {
  fill(8);
  assert.equal(await peopleUsedByOwner(OWNER), 8);
  assert.equal((await joinDenial(prisma, B, randomUUID())).error, "team_full");
  assert.equal(await joinDenial(prisma, B, OWNER), null);
});
test("duplicates and foreign memberships do not consume additional owner places", async () => {
  fill(7);
  state.members.push({ ...state.members[0], teamId: B }, { teamId: FOREIGN, userId: randomUUID() });
  assert.equal(await peopleUsedByOwner(OWNER), 7);
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
});
test("existing teammates can join another workspace while full or grandfathered above the cap", async () => {
  fill(12);
  assert.equal(await joinDenial(prisma, B, state.members[0].userId), null);
  assert.equal((await joinDenial(prisma, B, randomUUID())).error, "team_full");
  assert.equal(state.members.length, 11, "no existing members removed");
});
test("a place is freed only after the last owned membership disappears", async () => {
  fill(8);
  const person = state.members[0].userId;
  state.members.push({ teamId: B, userId: person });
  state.members.splice(0, 1);
  assert.equal((await joinDenial(prisma, B, randomUUID())).error, "team_full");
  state.members = state.members.filter((m) => m.userId !== person);
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
});
test("plan overrides use the same shared allowance; Ultra has finite people and team caps", async () => {
  fill(25);
  state.owner = { plan: "starter", planOverride: "pro", peoplePolicy: "account" };
  assert.equal((await joinDenial(prisma, B, randomUUID())).error, "team_full");
  state.owner.planOverride = "ultra";
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
  assert.equal(limitsFor("ultra").members, 50);
  assert.equal(limitsFor("ultra").teams, 20);
});
test("Free keeps workspace limits; paid existing teammates still respect promotion/team capacity", async () => {
  state.owner.plan = "free";
  fill(4);
  assert.equal(memberScopeForOwner(state.owner), "workspace");
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
  assert.equal((await joinDenial(prisma, A, randomUUID())).error, "team_full");
  state.owner.plan = "starter";
  state.teams.set(B, { ownerId: OWNER, kind: "workspace" });
  for (let i = 0; i < 2; i++) state.teams.set(randomUUID(), { ownerId: OWNER, kind: "team" });
  assert.equal((await joinDenial(prisma, B, state.members[0].userId)).error, "workspace_limit");
});
test("concurrent accepts in different workspaces serialize on their owner and admit only one new person", async () => {
  fill(7);
  const one = randomUUID(),
    two = randomUUID();
  const results = await Promise.all([accept(invite(A, one), one), accept(invite(B, two), two)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await peopleUsedByOwner(OWNER), 8);
  assert.deepEqual(state.locks, ["owner", "team", "invitation", "owner", "team", "invitation"]);
  const rejected = results.find((r) => r.status === 409);
  assert.equal((await rejected.json()).error, "team_full");
  assert.equal([...state.invites.values()].filter((i) => i.status === "pending").length, 1);
});
test("duplicate concurrent acceptance creates one membership and rechecks invitation state", async () => {
  const person = randomUUID(),
    id = invite(A, person);
  const results = await Promise.all([accept(id, person), accept(id, person)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(state.members.filter((m) => m.userId === person).length, 1);
});

test("acceptance reloads a downgraded owner plan after acquiring the lock", async () => {
  state.owner.plan = "pro";
  fill(9);
  const person = randomUUID();
  state.afterOwnerLock = () => {
    state.owner.plan = "starter";
  };
  const result = await accept(invite(B, person), person);
  assert.equal(result.status, 409);
  assert.equal(
    state.members.some((m) => m.userId === person),
    false
  );
});
test("an invitation expiring while waiting for the owner lock creates no membership", async () => {
  const person = randomUUID(),
    id = invite(B, person);
  state.afterOwnerLock = () => {
    state.invites.get(id).expiresAt = new Date(0);
  };
  const result = await accept(id, person);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "invite_expired");
  assert.equal(state.members.length, 0);
});

test("legacy Starter retains separate workspace capacity; legacy Ultra retains unlimited workspaces and members", async () => {
  state.owner.peoplePolicy = "legacy";
  fill(9);
  assert.equal(memberScopeForOwner(state.owner), "workspace");
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
  assert.equal((await joinDenial(prisma, A, randomUUID())).error, "team_full");
  state.owner.plan = "ultra";
  assert.equal(await joinDenial(prisma, A, randomUUID()), null);
  state.teams.get(B).kind = "workspace";
  for (let i = 0; i < 25; i++) state.teams.set(randomUUID(), { ownerId: OWNER, kind: "team" });
  assert.equal(await joinDenial(prisma, B, randomUUID()), null);
});
