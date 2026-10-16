import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityCard } from "../app/(app)/analytics/ActivityCard.tsx";
import { ChartTooltip } from "../app/(app)/analytics/ChartTooltip.tsx";
import { DistributionCard } from "../app/(app)/analytics/DistributionCard.tsx";
import { SERIES, normalizeWindowSeries } from "../app/(app)/analytics/analytics-model.ts";
const first = { date: "2026-10-14", created: 3, in_progress: 3, completed: 0, canceled: 0 };
const last = { date: "2026-10-15", created: 3, in_progress: 3, completed: 3, canceled: 0 };
const data = {
  range: 14,
  series: [first, last],
  totals: { open: 0, in_progress: 0, completed: 3, canceled: 0 },
};
const visible = new Set(SERIES.map((s) => s.key));
test("activity card labels historical moves and explicitly separates them from current counts", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActivityCard, { data, loading: false, error: null, load: async () => {} })
  );
  assert.match(html, /Activity history/);
  assert.match(html, /Cumulative events, not current task counts/);
  assert.match(html, /Moved to in progress/);
  assert.match(html, /Marked completed/);
  assert.match(html, /same task can be counted more than once/);
  assert.match(html, /See Current distribution/);
});
test("current distribution keeps its current-state labels and values", () => {
  const html = renderToStaticMarkup(React.createElement(DistributionCard, { data }));
  assert.match(html, /In progress/);
  assert.doesNotMatch(html, /Moved to in progress/);
  assert.match(html, /Completed/);
});
test("historical tooltip identifies cumulative events and labels deltas for the hovered day", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChartTooltip, {
      active: true,
      payload: [{ payload: last }],
      visible,
      series: data.series,
    })
  );
  assert.match(html, /Cumulative events/);
  assert.match(html, /Moved to in progress/);
  assert.match(html, /on this day/);
  assert.doesNotMatch(html, /today/);
  const baseline = renderToStaticMarkup(
    React.createElement(ChartTooltip, {
      active: true,
      payload: [{ payload: first }],
      visible,
      series: data.series,
    })
  );
  assert.doesNotMatch(baseline, /on this day/);
});
test("tooltip uses validated series values and safely ignores unknown library payloads", () => {
  for (const payload of [null, "bad", {}, { date: "not-in-series" }]) {
    assert.equal(
      renderToStaticMarkup(
        React.createElement(ChartTooltip, {
          active: true,
          payload: [{ payload }],
          visible,
          series: data.series,
        })
      ),
      ""
    );
  }
  const html = renderToStaticMarkup(
    React.createElement(ChartTooltip, {
      active: true,
      payload: [{ payload: { ...last, in_progress: 9999 } }],
      visible,
      series: data.series,
    })
  );
  assert.doesNotMatch(html, /9999/);
});
test("quiet-day normalization retains historical activity without inventing current counts", () => {
  const rows = normalizeWindowSeries(data, ["2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.equal(rows.at(-1).in_progress, 3);
  assert.equal(data.totals.in_progress, 0);
});
