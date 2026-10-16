import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { Hono } from "hono";
const TEAM = "team";
const TODAY = Date.UTC(2026, 9, 16, 12);
let state;
await mock.module("../src/db.ts", {
  namedExports: {
    prisma: {
      taskEvent: {
        findMany: async ({ where }) => {
          state.reads++;
          return state.events
            .filter((e) => e.teamId === where.teamId)
            .sort((a, b) => a.createdAt - b.createdAt);
        },
      },
      task: {
        groupBy: async ({ where }) => {
          const counts = new Map();
          for (const task of state.tasks.filter((t) => t.teamId === where.teamId))
            counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
          return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
        },
      },
    },
  },
});
await mock.module("../src/lib/team-membership.ts", {
  namedExports: { getTeamRole: async () => (state.allowed ? "owner" : null) },
});
const { analyticsRoutes } = await import("../src/routes/analytics.ts");
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("userId", "reader");
    await next();
  })
  .route("/", analyticsRoutes);
beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: TODAY });
  state = { tasks: [], events: [], allowed: true, reads: 0 };
});
function event(task, fromStatus, toStatus, day = 0) {
  state.events.push({
    teamId: TEAM,
    taskId: task.id,
    fromStatus,
    toStatus,
    createdAt: new Date(TODAY + day * 86400000),
  });
  task.status = toStatus;
}
function create(id, status = "todo", day = -3) {
  const task = { id, status, teamId: TEAM };
  state.tasks.push(task);
  event(task, null, status, day);
  return task;
}
async function read(range = 14) {
  const response = await app.request(`/teams/${TEAM}/analytics?range=${range}`);
  assert.equal(response.status, 200);
  return response.json();
}
test("three completed tasks reproduce historical moves of 3 with zero currently in progress", async () => {
  for (let i = 0; i < 3; i++) {
    const task = create(String(i));
    event(task, "todo", "in_progress", -2);
    event(task, "in_progress", "done", -1);
  }
  const data = await read();
  assert.deepEqual(data.totals, { open: 0, in_progress: 0, completed: 3, canceled: 0 });
  assert.deepEqual(data.series.at(-1), {
    date: "2026-10-16",
    created: 3,
    in_progress: 3,
    completed: 3,
    canceled: 0,
  });
  assert.deepEqual(await read(), data); // A new request/reload retains historical semantics.
});
test("reopening and completing again count events while current distribution follows actual state", async () => {
  const task = create("one");
  event(task, "todo", "in_progress", -2);
  event(task, "in_progress", "done", -1);
  event(task, "done", "in_progress");
  const reopened = await read();
  assert.equal(reopened.totals.in_progress, 1);
  assert.equal(reopened.totals.completed, 0);
  assert.equal(reopened.series.at(-1).in_progress, 2);
  assert.equal(reopened.series.at(-1).completed, 1);
  event(task, "in_progress", "done");
  const closed = await read();
  assert.equal(closed.totals.in_progress, 0);
  assert.equal(closed.totals.completed, 1);
  assert.equal(closed.series.at(-1).in_progress, 2);
  assert.equal(closed.series.at(-1).completed, 2);
});
test("canceling and reopening retain history without representing canceled tasks as active", async () => {
  const task = create("one");
  event(task, "todo", "in_progress", -2);
  event(task, "in_progress", "canceled", -1);
  const canceled = await read();
  assert.equal(canceled.totals.in_progress, 0);
  assert.equal(canceled.totals.canceled, 1);
  assert.equal(canceled.series.at(-1).in_progress, 1);
  assert.equal(canceled.series.at(-1).canceled, 1);
  event(task, "canceled", "todo");
  const reopened = await read();
  assert.equal(reopened.totals.open, 1);
  assert.equal(reopened.totals.canceled, 0);
  assert.equal(reopened.series.at(-1).canceled, 1);
});
test("a creation directly in progress is a creation event rather than a later move", async () => {
  create("one", "in_progress");
  const data = await read();
  assert.equal(data.totals.in_progress, 1);
  assert.equal(data.series.at(-1).created, 1);
  assert.equal(data.series.at(-1).in_progress, 0);
});
test("range includes earlier lifetime events, carries quiet days and excludes other teams", async () => {
  const task = create("one", "todo", -20);
  event(task, "todo", "in_progress", -19);
  event(task, "in_progress", "done", -18);
  state.events.push({
    teamId: "other",
    taskId: "other",
    fromStatus: null,
    toStatus: "todo",
    createdAt: new Date(TODAY),
  });
  state.tasks.push({ id: "other", teamId: "other", status: "in_progress" });
  const data = await read(14);
  assert.equal(data.series.length, 14);
  assert.equal(data.series[0].created, 1);
  assert.equal(data.series[0].in_progress, 1);
  assert.equal(data.series.at(-1).in_progress, 1);
  assert.equal(data.totals.in_progress, 0);
});
test("empty workspaces remain zero-filled and unauthorized reads never query history", async () => {
  const empty = await read();
  assert.equal(empty.series.length, 1);
  assert.equal(empty.series[0].created, 0);
  state.allowed = false;
  state.reads = 0;
  assert.equal((await app.request(`/teams/${TEAM}/analytics`)).status, 403);
  assert.equal(state.reads, 0);
});
