import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../lib/api.ts";
import { toTask, toComment } from "../../backend/src/lib/types.ts";
import { createTaskSchema } from "../../backend/src/lib/validation.ts";
import {
  TASK_TITLE_MAX_CHARACTERS,
  TASK_DESCRIPTION_MAX_CHARACTERS,
} from "../app/(app)/tasks/task-content.ts";
const date = new Date("2026-10-16T00:00:00Z");
const task = (id) =>
  toTask({
    id,
    teamId: "w",
    title: id,
    description: null,
    status: "todo",
    priority: "medium",
    dueDate: null,
    flagged: false,
    projectId: null,
    createdAt: date,
    updatedAt: date,
  });
const comment = (id, parentId = null) =>
  toComment({
    id,
    taskId: "t",
    authorId: "u",
    author: { id: "u", username: "alice", displayName: null, createdAt: date },
    parentId,
    body: id,
    createdAt: date,
    updatedAt: date,
  });
const response = (body, cursor) =>
  Response.json(body, { headers: cursor ? { "x-mokara-next-cursor": cursor } : {} });

test("task reads follow every page and preserve status, credentials and cancellation signal", async (t) => {
  const controller = new AbortController();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (raw, init) => {
    const url = new URL(raw, "https://test.invalid");
    calls.push(url);
    assert.equal(init.signal, controller.signal);
    assert.equal(init.credentials, "include");
    assert.equal(url.searchParams.get("status"), "todo");
    const n = calls.length - 1;
    return response(
      Array.from({ length: n === 2 ? 5 : 100 }, (_, i) => task(`task-${n * 100 + i}`)),
      n < 2 ? `page ${n + 1}` : null
    );
  });
  const tasks = await api.listTeamTasks("w", "todo", controller.signal);
  assert.equal(tasks.length, 205);
  assert.equal(new Set(tasks.map((row) => row.id)).size, 205);
  assert.equal(calls[1].searchParams.get("cursor"), "page 1");
  assert.equal(calls.length, 3);
});
test("comments assemble cross-page reply threads and deduplicate overlapping IDs", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? response({ comments: [comment("root")] }, "next")
      : response({ comments: [comment("root"), comment("reply", "root")] })
  );
  const result = await api.listComments("t");
  assert.deepEqual(
    result.comments.map((row) => row.id),
    ["root", "reply"]
  );
  assert.equal(result.comments[1].parent_id, "root");
});
test("a failed later page rejects the entire collection rather than returning partial success", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? response([task("one")], "next")
      : Response.json({ error: "forbidden", message: "Access changed." }, { status: 403 })
  );
  await assert.rejects(
    api.listTeamTasks("w"),
    (error) => error.error === "forbidden" && error.status === 403
  );
  assert.equal(calls, 2);
});
test("cancellation prevents following another page even if the transport ignores the signal", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    controller.abort();
    return response([task("one")], "next");
  });
  await assert.rejects(api.listTeamTasks("w", undefined, controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});
test("repeated cursors, empty continuation pages and oversized headers cannot loop", async (t) => {
  for (const mode of ["repeat", "empty", "long"]) {
    let calls = 0;
    const fetcher = t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return response(
        mode === "empty" ? [] : [task("one")],
        mode === "long" ? "a".repeat(513) : "same"
      );
    });
    await assert.rejects(api.listTeamTasks("w"), (error) => error.error === "invalid_response");
    assert.equal(calls, mode === "repeat" ? 2 : 1);
    fetcher.mock.restore();
  }
});
test("a malformed later response cannot replace the complete list with a partial one", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? response({ comments: [comment("one")] }, "next")
      : response({ comments: [{ id: "bad" }] })
  );
  await assert.rejects(api.listComments("t"), (error) => error.error === "invalid_response");
});
test("legacy servers without continuation headers remain compatible", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response([task("one")]));
  assert.deepEqual(
    (await api.listTeamTasks("w")).map((row) => row.id),
    ["one"]
  );
});
test("frontend task-content guidance matches server write boundaries", () => {
  const input = {
    title: "t".repeat(TASK_TITLE_MAX_CHARACTERS),
    description: "d".repeat(TASK_DESCRIPTION_MAX_CHARACTERS),
  };
  assert.equal(createTaskSchema.safeParse(input).success, true);
  assert.equal(createTaskSchema.safeParse({ ...input, title: input.title + "t" }).success, false);
  assert.equal(
    createTaskSchema.safeParse({ ...input, description: input.description + "d" }).success,
    false
  );
});
