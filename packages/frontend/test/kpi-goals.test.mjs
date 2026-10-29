import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { goal, list, history, result } from "./fixtures/kpi-goals.mjs";
import {
  goalValue,
  goalState,
  kpiGoalListSchema,
  kpiGoalResultSchema,
  kpiGoalHistorySchema,
} from "../lib/kpi-goals.ts";
import { KpiGoalCard } from "../components/kpis/KpiGoalCard.tsx";
import { KpiGoalEditor } from "../components/kpis/KpiGoalEditor.tsx";
import { KpiGoalCheckIn } from "../components/kpis/KpiGoalCheckIn.tsx";
const render = (element) =>
  renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: { replace: () => {} } }, element)
  );
test("business KPI contracts keep exact decimals and validate history", () => {
  assert.equal(kpiGoalListSchema.safeParse(list).success, true);
  assert.equal(kpiGoalResultSchema.safeParse(result).success, true);
  assert.equal(kpiGoalHistorySchema.safeParse(history).success, true);
  assert.equal(
    kpiGoalListSchema.safeParse({ ...list, goals: [{ ...goal, target: 20000 }] }).success,
    false
  );
  assert.equal(
    kpiGoalListSchema.safeParse({ ...list, goals: [{ ...goal, progress: Infinity }] }).success,
    false
  );
  assert.equal(goalValue(goal, "999999999999.9999"), "MYR 999,999,999,999.9999");
  assert.equal(goalValue({ ...goal, measurement: "percentage" }, "95.0000"), "95%");
});
test("status is honest about missing check-ins and period boundaries", () => {
  assert.equal(goalState(goal, "2026-10-29"), "No check-ins");
  assert.equal(
    goalState({ ...goal, current_value: "5000", progress: 25 }, "2026-10-29"),
    "In progress"
  );
  assert.equal(goalState(goal, "2026-11-01"), "Period ended");
  assert.equal(goalState(goal, "2026-09-30"), "Starts soon");
  assert.equal(goalState({ ...goal, current_value: "20000", progress: 100 }), "Target reached");
  assert.equal(goalState({ ...goal, archived: true }), "Archived");
});
test("read-only cards preserve history access without showing unauthorized writes", () => {
  const html = renderToStaticMarkup(
    React.createElement(KpiGoalCard, {
      goal: { ...goal, name: "<script>sales</script>", can_manage: false, can_check_in: false },
      onAction: () => {},
    })
  );
  assert.match(html, /No result yet/);
  assert.match(html, /History/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, />Check in<|>Edit details<|aria-valuenow="0"/);
});
test("create and edit forms distinguish actual measurements from legacy task credit", () => {
  const html = render(
    React.createElement(KpiGoalEditor, {
      teamId: goal.team_id,
      userId: goal.owner_id,
      data: list,
      onSaved: () => {},
      onCancel: () => {},
    })
  );
  for (const label of ["Accountable owner", "Target value", "Starting value", "Period starts"])
    assert.ok(html.toLowerCase().includes(label.toLowerCase()));
  assert.match(html, /Completing a task does not change this KPI/);

  const edited = render(
    React.createElement(KpiGoalEditor, {
      teamId: goal.team_id,
      userId: goal.owner_id,
      data: list,
      goal,
      onSaved: () => {},
      onCancel: () => {},
    })
  );
  assert.match(edited, /Visibility, measurement, target and period stay fixed/);
  assert.match(edited, /Archive this KPI/);
  assert.match(edited, /Contributors who can submit check-ins/);
  assert.match(edited, /type="checkbox"/);
});
test("check-in form asks for an absolute dated result and retains a correction note", () => {
  const html = render(
    React.createElement(KpiGoalCheckIn, {
      teamId: goal.team_id,
      goal,
      onSaved: () => {},
      onCancel: () => {},
    })
  );
  assert.match(html, /not an amount to add/);
  assert.match(html, /Observation date/);
  assert.match(html, /Note, optional/);
  assert.match(html, /Older observations remain in history/);
});
