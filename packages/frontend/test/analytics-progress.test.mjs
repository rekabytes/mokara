import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressGantt } from "../app/(app)/analytics/ProgressGantt.tsx";
import { dayIdxOfYear, HEAT_CLASS } from "../app/(app)/analytics/analytics-model.ts";

beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 16, 12).getTime() });
});
const task = {
  id: "reopened",
  title: "Reopened work",
  status: "done",
  created_at: "2026-10-10",
  started_at: "2026-10-11",
  due_date: "2026-10-20",
  completed_at: "2026-10-12",
  due_changes: [{ from_due: "2026-10-15", to_due: "2026-10-20", changed_at: "2026-10-13" }],
};
function render(value) {
  return renderToStaticMarkup(
    React.createElement(ProgressGantt, { tasks: [value], scrollRef: { current: null } })
  );
}
function cell(html, day) {
  const col = dayIdxOfYear(2026, new Date(2026, 9, day));
  return html.match(new RegExp(`<div data-col="${col}"[^>]*>[\\s\\S]*?</div>`))?.[0] ?? "";
}
const tick = 'd="M20 6 9 17l-5-5"';
for (const status of ["todo", "in_progress"]) {
  test(`reopened ${status} work ignores a stale completion and stays unfinished after remount`, () => {
    assert.ok(render(task).includes(tick));
    const reopened = { ...task, status };
    const html = render(reopened);
    assert.ok(!html.includes(tick));
    assert.ok(!cell(html, 12).includes(HEAT_CLASS.done));
    assert.ok(cell(html, 16).includes(HEAT_CLASS.active));
    assert.ok(cell(html, 15).includes("var(--color-warning)"));
    assert.ok(cell(html, 20).includes("outline:"));
    assert.equal(render(reopened), html);
    assert.equal(render({ ...reopened, completed_at: null }), html);
  });
}
test("completing again moves the finish marker to the latest completion day", () => {
  const html = render({ ...task, completed_at: "2026-10-16" });
  assert.ok(cell(html, 16).includes(tick));
  assert.ok(!cell(html, 12).includes(tick));
  assert.equal(html.split(tick).length - 1, 1);
});
test("overdue reopened work continues through today and preserves deadline markers", () => {
  const html = render({ ...task, status: "in_progress", due_date: "2026-10-14" });
  assert.ok(!html.includes(tick));
  assert.ok(cell(html, 14).includes("outline:"));
  assert.ok(cell(html, 15).includes(HEAT_CLASS.late));
  assert.ok(cell(html, 16).includes(HEAT_CLASS.late));
  assert.equal(cell(html, 17), "");
});
test("direct completion has a finish marker and empty workspaces stay empty", () => {
  assert.ok(render({ ...task, started_at: null }).includes(tick));
  const html = renderToStaticMarkup(
    React.createElement(ProgressGantt, { tasks: [], scrollRef: { current: null } })
  );
  assert.ok(!html.includes("data-row-id"));
});

test("a late completion keeps its actual finish day and stops extending after it", () => {
  const html = render({ ...task, due_date: "2026-10-11", completed_at: "2026-10-14" });
  assert.ok(cell(html, 14).includes(tick));
  assert.ok(cell(html, 14).includes(HEAT_CLASS.late));
  assert.equal(cell(html, 15), "");
});
