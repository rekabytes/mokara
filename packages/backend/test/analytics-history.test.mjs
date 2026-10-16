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
            .filter(
              (e) =>
                e.teamId === where.teamId &&
                (!where.taskId || where.taskId.in.includes(e.taskId)) &&
                (!where.toStatus || where.toStatus.in.includes(e.toStatus))
            )
            .sort((a, b) => a.createdAt - b.createdAt);
        },
      },
      task: {
        findMany: async ({ where }) =>
          state.tasks.filter(
            (t) => t.teamId === where.teamId && t.dueDate && t.status !== "canceled"
          ),
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

function scheduled(id, dueDay = 2) {
  const task = create(id);
  Object.assign(task, {
    title: id,
    createdAt: new Date(TODAY - 3 * 86400000),
    dueDate: new Date(TODAY + dueDay * 86400000),
    dueChanges: [],
  });
  event(task, "todo", "in_progress", -2);
  event(task, "in_progress", "done", -1);
  return task;
}
async function progress() {
  const response = await app.request(`/teams/${TEAM}/progress`);
  assert.equal(response.status, 200);
  return response.json();
}
for (const status of ["todo", "in_progress"]) {
  test(`progress clears the finish when reopened to ${status}, including a fresh request`, async () => {
    const task = scheduled("reopened");
    assert.equal(
      (await progress()).tasks[0].completed_at,
      new Date(TODAY - 86400000).toISOString()
    );
    event(task, "done", status);
    const reopened = await progress();
    assert.equal(reopened.tasks[0].status, status);
    assert.equal(reopened.tasks[0].completed_at, null);
    assert.equal(reopened.tasks[0].started_at, new Date(TODAY - 2 * 86400000).toISOString());
    assert.deepEqual(await progress(), reopened);
    assert.equal((await read()).series.at(-1).completed, 1);
    event(task, status, "done");
    // Deliberately reverse events to ensure the latest completion is chosen by date.
    state.events.reverse();
    assert.equal((await progress()).tasks[0].completed_at, new Date(TODAY).toISOString());
    assert.equal((await read()).series.at(-1).completed, 2);
  });
}
test("overdue reopening preserves the deadline and its change history", async () => {
  const task = scheduled("overdue", -1);
  task.dueChanges.push({
    fromDue: new Date(TODAY - 2 * 86400000),
    toDue: task.dueDate,
    createdAt: new Date(TODAY - 86400000),
  });
  event(task, "done", "in_progress");
  const data = (await progress()).tasks[0];
  assert.equal(data.completed_at, null);
  assert.equal(data.due_date, task.dueDate.toISOString());
  assert.deepEqual(data.due_changes, [
    {
      from_due: task.dueChanges[0].fromDue.toISOString(),
      to_due: task.dueDate.toISOString(),
      changed_at: task.dueChanges[0].createdAt.toISOString(),
    },
  ]);
});
test("progress excludes canceled, unscheduled and other-team tasks and enforces membership", async () => {
  scheduled("visible");
  scheduled("canceled").status = "canceled";
  scheduled("other").teamId = "other";
  scheduled("unscheduled").dueDate = null;
  assert.deepEqual(
    (await progress()).tasks.map((t) => t.id),
    ["visible"]
  );
  state.allowed = false;
  state.reads = 0;
  assert.equal((await app.request(`/teams/${TEAM}/progress`)).status, 403);
  assert.equal(state.reads, 0);
});
