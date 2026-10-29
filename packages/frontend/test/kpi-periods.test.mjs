import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { goal, list } from "./fixtures/kpi-goals.mjs";
import { nextPeriodDates } from "../lib/kpi-periods.ts";
import { kpiGoalPeriodsSchema, kpiGoalHistorySchema } from "../lib/kpi-goals.ts";
import { KpiGoalEditor } from "../components/kpis/KpiGoalEditor.tsx";
import { KpiPeriodComparison } from "../components/kpis/KpiPeriodComparison.tsx";

test("monthly and quarterly presets handle year boundaries and leap months", () => {
  for (const [end, months, start, finish] of [
    ["2026-10-31", 1, "2026-11-01", "2026-11-30"],
    ["2026-12-31", 3, "2027-01-01", "2027-03-31"],
    ["2028-01-31", 1, "2028-02-01", "2028-02-29"],
    ["2026-01-31", 1, "2026-02-01", "2026-02-28"],
    ["2026-10-14", 1, "2026-10-15", "2026-11-14"],
    ["2026-01-30", 1, "2026-01-31", "2026-02-27"],
  ])
    assert.deepEqual(nextPeriodDates(end, months), { start_date: start, end_date: finish });
});
test("next-period form requires confirmation and does not copy measured results", () => {
  const previous = { ...goal, current_value: "18000", progress: 90 };
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: { replace: () => {} } },
      React.createElement(KpiGoalEditor, {
        teamId: goal.team_id,
        userId: goal.owner_id,
        data: list,
        previousGoal: previous,
        onSaved: () => {},
        onCancel: () => {},
      })
    )
  );
  assert.match(html, /Create next reporting period/);
  assert.match(html, /Monthly, one month/);
  assert.match(html, /Quarterly, three months/);
  assert.match(html, /value="2026-11-01"/);
  assert.match(html, /value="2026-11-30"/);
  assert.match(html, /No future periods will be created automatically/);
  assert.doesNotMatch(html, /value="18000"/);
  assert.match(html, />Create period</);
});
test("comparison shows raw results and different targets without ranking periods", () => {
  const previous = {
    ...goal,
    id: "33333333-3333-4333-8333-333333333333",
    current_value: "18000",
    progress: 90,
  };
  const selected = {
    ...goal,
    current_value: "22000",
    target: "25000",
    progress: 88,
    previous_goal_id: previous.id,
  };
  const periods = { goal: selected, previous, next: null };
  assert.equal(kpiGoalPeriodsSchema.safeParse(periods).success, true);
  const html = renderToStaticMarkup(React.createElement(KpiPeriodComparison, { periods }));
  for (const text of [
    "MYR 18,000",
    "MYR 20,000",
    "MYR 22,000",
    "MYR 25,000",
    "90%",
    "88%",
    "-2 percentage points",
    "does not judge which period performed better",
  ])
    assert.ok(html.includes(text), text);
  assert.match(html, /aria-label="Selected period:/);
  assert.match(html, /role="progressbar"/);
});
test("unreported periods never imply zero attainment; old history remains compatible", () => {
  const html = renderToStaticMarkup(
    React.createElement(KpiPeriodComparison, { periods: { goal, previous: null, next: null } })
  );
  assert.match(html, /No result recorded/);
  assert.match(html, /Unreported/);
  assert.doesNotMatch(html, /Selected versus previous period:/);
  const oldSnapshot = { ...goal };
  for (const field of ["previous_goal_id", "next_goal_id", "can_create_period"])
    delete oldSnapshot[field];
  assert.equal(
    kpiGoalHistorySchema.safeParse({
      entries: [
        {
          id: goal.id,
          sequence: "1",
          kind: "created",
          author_name: "Alex",
          value: null,
          observed_on: null,
          note: "",
          revision: 1,
          snapshot: oldSnapshot,
          created_at: goal.created_at,
        },
      ],
      next_cursor: null,
    }).success,
    true
  );
});
