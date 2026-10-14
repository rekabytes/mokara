import { test, mock } from "node:test";
import assert from "node:assert/strict";
mock.module("../src/db.ts", { namedExports: { prisma: {} } });
mock.module("../src/env.ts", { namedExports: { isHosted: false } });
const { joinDenial, limitsOfUser, teamCountDenial, memberLimitForOwner } =
  await import("../src/lib/entitlements.ts");
test("self-hosted joins, people and workspace capacity remain unlimited without quota DB queries", async () => {
  assert.equal(await joinDenial({}, "workspace", "invitee"), null);
  assert.equal(await teamCountDenial("owner"), null);
  assert.equal((await limitsOfUser("owner")).members, Infinity);
  assert.equal((await limitsOfUser("owner")).teams, Infinity);
  assert.equal(memberLimitForOwner({ plan: "ultra", planOverride: null }), null);
});
