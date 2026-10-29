import { test } from "node:test";
import assert from "node:assert/strict";
import { numericGoalProgress } from "../src/lib/kpi-goal-progress.ts";
import {
  createKpiGoalSchema,
  checkInKpiGoalSchema,
  updateKpiGoalSchema,
} from "../src/lib/validation.ts";
import { randomUUID } from "node:crypto";
test("business progress handles increasing/decreasing targets without invented observations", () => {
  for (const [start, target, current, expected] of [
    ["0", "20000", null, null],
    ["0", "20000", "5000", 25],
    ["0", "20000", "19999.9999", 99.99],
    ["24", "12", "18", 50],
    ["24", "12", "30", 0],
    ["24", "12", "10", 100],
    ["0", "3", "1", 33.33],
    ["80", "95", "86", 40],
    ["1", "1", "1", null],
  ])
    assert.equal(numericGoalProgress(start, target, current), expected);
});
test("business values are bounded decimal strings and dates are real calendar dates", () => {
  const good = {
    request_id: randomUUID(),
    name: "Sales",
    scope: "personal",
    measurement: "money",
    unit: "MYR",
    baseline: "0",
    target: "20000.1234",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
    owner_id: randomUUID(),
    contributor_ids: [],
  };
  assert.equal(createKpiGoalSchema.safeParse(good).success, true);
  for (const patch of [
    { target: 20000 },
    { target: "1e20" },
    { target: "NaN" },
    { target: "1.12345" },
    { target: "1000000000000" },
    { start_date: "2026-02-31" },
    { scope: "everyone" },
    { owner_id: "unknown" },
    { extra: true },
  ])
    assert.equal(
      createKpiGoalSchema.safeParse({ ...good, ...patch }).success,
      false,
      JSON.stringify(patch)
    );
  const member = randomUUID();
  assert.equal(
    createKpiGoalSchema.safeParse({ ...good, contributor_ids: [member, member] }).success,
    false
  );
});
test("check-ins require a request identity and current revision; goal edits cannot rewrite targets", () => {
  const good = {
    request_id: randomUUID(),
    expected_revision: 1,
    value: "-10.1234",
    observed_on: "2026-10-29",
    note: "Correction",
  };
  assert.equal(checkInKpiGoalSchema.safeParse(good).success, true);
  assert.equal(checkInKpiGoalSchema.safeParse({ ...good, expected_revision: 0 }).success, false);
  assert.equal(checkInKpiGoalSchema.safeParse({ ...good, request_id: "" }).success, false);
  assert.equal(
    updateKpiGoalSchema.safeParse({
      request_id: randomUUID(),
      expected_revision: 1,
      name: "Sales",
      owner_id: randomUUID(),
      contributor_ids: [],
      archived: false,
      target: "50000",
    }).success,
    false
  );
});
