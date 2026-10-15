import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { Hono } from "hono";
import { collectionPage, collectionCursor } from "../src/lib/collection-page.ts";
import { createTaskSchema, updateTaskSchema } from "../src/lib/validation.ts";
const TEAM = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const TASK = "00000000-0000-4000-8000-000000000003";
const date = new Date("2026-10-16T00:00:00.000Z");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let state;
function findMany(query, kind) {
  state.queries.push({ kind, query });
  assert.ok(query.take <= 101);
  assert.equal(query.skip, undefined);
  return state[kind]
    .filter((row) => {
      if (query.where.teamId && row.teamId !== query.where.teamId) return false;
      if (query.where.taskId && row.taskId !== query.where.taskId) return false;
      if (query.where.status && row.status !== query.where.status) return false;
      return (
        !query.where.OR ||
        query.where.OR.some((clause) => {
          const value = clause.createdAt;
          if (value instanceof Date)
            return (
              row.createdAt.getTime() === value.getTime() &&
              (clause.id.gt ? row.id > clause.id.gt : row.id < clause.id.lt)
            );
          return value.gt ? row.createdAt > value.gt : row.createdAt < value.lt;
        })
      );
    })
    .sort((a, b) => {
      const compare = a.createdAt - b.createdAt || a.id.localeCompare(b.id);
      return query.orderBy[0].createdAt === "asc" ? compare : -compare;
    })
    .slice(0, query.take);
}
await mock.module("../src/db.ts", {
  namedExports: {
    prisma: {
      task: {
        findMany: async (q) => findMany(q, "tasks"),
        findUnique: async () => ({ teamId: TEAM }),
      },
      comment: { findMany: async (q) => findMany(q, "comments") },
    },
  },
});
await mock.module("../src/lib/team-membership.ts", {
  namedExports: { getTeamRole: async () => (state.allowed ? "owner" : null) },
});
await mock.module("../src/routes/attachments.ts", {
  namedExports: { purgeAttachmentObjects: async () => {} },
});
await mock.module("../src/lib/task-response.ts", {
  namedExports: { TASK_INCLUDE: {}, taskResponse: (row) => ({ id: row.id, title: row.title }) },
});
await mock.module("../src/lib/types.ts", {
  namedExports: { toComment: (row) => ({ id: row.id, parent_id: row.parentId }) },
});
await mock.module("../src/lib/github-sync.ts", {
  namedExports: { enqueueGitHubTaskSync: async () => {} },
});
await mock.module("../src/lib/notifications.ts", {
  namedExports: { notify: async () => {}, regenerateDueSoonForTeam: async () => {} },
});
await mock.module("../src/lib/events.ts", { namedExports: { publishToTeam: async () => {} } });
await mock.module("../src/lib/logger.ts", { namedExports: { log: { error: () => {} } } });
const { taskRoutes } = await import("../src/routes/tasks.ts");
const { commentRoutes } = await import("../src/routes/comments.ts");
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("userId", "reader");
    await next();
  })
  .route("/", taskRoutes)
  .route("/", commentRoutes);
beforeEach(() => {
  state = {
    allowed: true,
    queries: [],
    tasks: Array.from({ length: 205 }, (_, n) => ({
      id: id(n + 10),
      teamId: TEAM,
      createdAt: date,
      title: `Task ${n}`,
      status: n % 2 ? "done" : "todo",
    })),
    comments: Array.from({ length: 205 }, (_, n) => ({
      id: id(n + 10),
      taskId: TASK,
      createdAt: date,
      parentId: n ? id(10) : null,
    })),
  };
});
async function all(path, pick) {
  let cursor;
  const rows = [];
  let pages = 0;
  do {
    const response = await app.request(
      path + (cursor ? `${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : "")
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const items = pick(await response.json());
    assert.ok(items.length <= 100);
    rows.push(...items);
    cursor = response.headers.get("x-mokara-next-cursor");
    assert.ok(++pages < 10);
  } while (cursor);
  return rows;
}
test("bounded task pages preserve all rows with identical timestamps", async () => {
  state.tasks.push({ ...state.tasks[0], id: id(999), teamId: OTHER });
  const rows = await all(`/teams/${TEAM}/tasks`, (r) => r);
  assert.equal(rows.length, 205);
  assert.equal(new Set(rows.map((r) => r.id)).size, 205);
  assert.deepEqual(
    rows.map((r) => r.id),
    state.tasks
      .filter((r) => r.teamId === TEAM)
      .map((r) => r.id)
      .sort()
      .reverse()
  );
  assert.equal(state.queries.length, 3);
});
test("comment pages retain replies whose root is on an earlier page", async () => {
  const rows = await all(`/tasks/${TASK}/comments`, (r) => r.comments);
  assert.equal(rows.length, 205);
  assert.equal(new Set(rows.map((r) => r.id)).size, 205);
  assert.equal(rows.at(-1).parent_id, rows[0].id);
  assert.deepEqual(
    rows.map((r) => r.id),
    state.comments.map((r) => r.id)
  );
});
test("status filters persist and another collection cannot reuse a cursor", async () => {
  assert.equal((await all(`/teams/${TEAM}/tasks?status=todo`, (r) => r)).length, 103);
  const cursor = collectionCursor(`tasks:${TEAM}:all`, state.tasks[0]);
  assert.equal(
    (await app.request(`/teams/${TEAM}/tasks?status=todo&cursor=${cursor}`)).status,
    400
  );
  assert.equal((await app.request(`/teams/${OTHER}/tasks?cursor=${cursor}`)).status, 400);
});
test("deleting the cursor row or inserting newer tasks does not shift continuation", async () => {
  const response = await app.request(`/teams/${TEAM}/tasks?limit=2`);
  const first = await response.json();
  const cursor = response.headers.get("x-mokara-next-cursor");
  state.tasks = state.tasks.filter((r) => r.id !== first[1].id);
  state.tasks.push({ ...state.tasks[0], id: id(998), createdAt: new Date(date.getTime() + 1) });
  const second = await app.request(`/teams/${TEAM}/tasks?limit=2&cursor=${cursor}`);
  assert.equal(second.status, 200);
  assert.deepEqual(
    (await second.json()).map((r) => r.id),
    [id(212), id(211)]
  );
});
test("membership checks reject before collection queries", async () => {
  state.allowed = false;
  for (const path of [`/teams/${TEAM}/tasks`, `/tasks/${TASK}/comments`])
    assert.equal((await app.request(path)).status, 403);
  assert.equal(state.queries.length, 0);
});
test("invalid paging inputs are rejected before list queries", async () => {
  for (const suffix of [
    "limit=0",
    "limit=101",
    "limit=1.5",
    "cursor=bad",
    "cursor=",
    `cursor=${"a".repeat(513)}`,
  ])
    for (const path of [`/teams/${TEAM}/tasks`, `/tasks/${TASK}/comments`])
      assert.equal((await app.request(`${path}?${suffix}`)).status, 400);
  assert.equal(state.queries.length, 0);
});
test("timestamps sort before ID tie-breakers", async () => {
  state.tasks = [
    { ...state.tasks[0], id: id(900), createdAt: new Date(date.getTime() - 1) },
    { ...state.tasks[1], id: id(10), createdAt: new Date(date.getTime() + 1) },
    { ...state.tasks[2], id: id(500), createdAt: date },
  ];
  assert.deepEqual(
    (await all(`/teams/${TEAM}/tasks?limit=1`, (r) => r)).map((r) => r.id),
    [id(10), id(500), id(900)]
  );
});
test("cursor parser validates scope, timestamp, ID and encoding", () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const value of [
    ["other", date.toISOString(), id(10)],
    ["tasks", "invalid", id(10)],
    ["tasks", date.toISOString(), "bad"],
  ])
    assert.equal(collectionPage({ cursor: encode(value) }, "tasks"), null);
  assert.equal(collectionPage({ cursor: "!!!!" }, "tasks"), null);
  assert.equal(collectionPage({}, "tasks").limit, 100);
});
test("content limits retain exact boundaries and metadata-only updates", () => {
  assert.equal(
    createTaskSchema.safeParse({ title: "t".repeat(500), description: "d".repeat(20000) }).success,
    true
  );
  for (const schema of [createTaskSchema, updateTaskSchema]) {
    assert.equal(schema.safeParse({ title: "t".repeat(501) }).success, false);
    assert.equal(
      schema.safeParse({ title: "Task", description: "d".repeat(20001) }).success,
      false
    );
  }
  assert.equal(updateTaskSchema.safeParse({ status: "done" }).success, true);
  assert.equal(updateTaskSchema.safeParse({ description: null }).success, true);
});

test("oversized task writes fail through the real route before any database write", async () => {
  for (const [path, method, body] of [
    [`/teams/${TEAM}/tasks`, "POST", { title: "t".repeat(501) }],
    [`/tasks/${TASK}`, "PATCH", { description: "d".repeat(20001) }],
  ]) {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_input");
  }
  assert.equal(state.queries.length, 0);
});
