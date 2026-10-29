import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { goal, review } from "./fixtures/kpi-goals.mjs";
import { reviewContext, observationChange } from "../lib/kpi-goal-review.ts";
import { kpiGoalReviewSchema } from "../lib/kpi-goals.ts";
import { KpiGoalTrend } from "../components/kpis/KpiGoalTrend.tsx";

test("pace review explains dates and never infers an outcome from no check-ins", () => {
  assert.equal(reviewContext(goal, "2026-10-29").label, "No recorded result");
  assert.equal(reviewContext(goal, "2026-11-01").label, "No recorded result");
  assert.equal(reviewContext(goal, "2026-09-30").label, "Not started");
  const measured = {
    ...goal,
    current_value: "10000",
    progress: 50,
    last_observed_on: "2026-10-10",
  };
  assert.equal(reviewContext(measured, "2026-10-16").expected, 50);
  assert.equal(reviewContext(measured, "2026-10-16").label, "At or above pace guide");
  assert.equal(reviewContext(measured, "2026-10-29").label, "Below pace guide");
  assert.match(reviewContext(measured, "2026-10-31").detail, /Due today/);
  assert.equal(reviewContext(measured, "2026-11-01").label, "Period ended");
  assert.equal(reviewContext({ ...measured, archived: true }, "2026-10-29").label, "Archived");
  assert.equal(
    reviewContext({ ...measured, progress: 100 }, "2026-11-01").label,
    "Target recorded"
  );
});
test("calendar pace supports one-day goals, leap days and stable UTC boundaries", () => {
  const measured = {
    ...goal,
    current_value: "0",
    progress: 0,
    last_observed_on: "2028-02-29",
    start_date: "2028-02-29",
    end_date: "2028-02-29",
  };
  assert.equal(reviewContext(measured, "2028-02-29").expected, 100);
  assert.equal(
    reviewContext({ ...measured, start_date: "2028-02-28", end_date: "2028-03-01" }, "2028-02-29")
      .expected,
    50
  );
});
test("observation changes use progress points, including decreasing measurements", () => {
  assert.equal(observationChange([]), null);
  assert.equal(observationChange([{ progress: 50 }]), null);
  assert.equal(observationChange([{ progress: 75 }, { progress: 50 }]), 25);
  assert.equal(observationChange([{ progress: 33.33 }, { progress: 50 }]), -16.67);
});
test("review schema validates exact values and rejects non-finite progress", () => {
  assert.equal(kpiGoalReviewSchema.safeParse(review).success, true);
  assert.equal(kpiGoalReviewSchema.safeParse({ ...review, as_of: "invalid" }).success, false);
});
test("empty trends do not render fabricated zero points", () => {
  const html = renderToStaticMarkup(React.createElement(KpiGoalTrend, { review }));
  assert.match(html, /No observations to plot/);
  assert.doesNotMatch(html, /<polyline|<circle/);
  assert.match(html, /not a prediction/);
});
test("trend keeps exact results, accessible tables and escaped notes", () => {
  const observations = [
    {
      id: goal.id,
      observed_on: "2026-10-29",
      value: "999999999999.9999",
      progress: 100,
      author_name: "<Alex>",
      note: "<script>bad</script>",
      recorded_at: goal.created_at,
    },
  ];
  const data = {
    ...review,
    goal: {
      ...goal,
      current_value: observations[0].value,
      progress: 100,
      last_observed_on: "2026-10-29",
    },
    observations,
  };
  assert.equal(kpiGoalReviewSchema.safeParse(data).success, true);
  const html = renderToStaticMarkup(React.createElement(KpiGoalTrend, { review: data }));
  assert.match(html, /MYR 999,999,999,999.9999/);
  assert.match(html, /scope="col"/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /All earlier corrections remain in History/);
  assert.equal(
    kpiGoalReviewSchema.safeParse({
      ...data,
      observations: [{ ...observations[0], progress: Infinity }],
    }).success,
    false
  );
});
