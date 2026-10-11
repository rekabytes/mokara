import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { api } from "../lib/api.ts";
import { useAsyncError } from "../hooks/useAsyncError.ts";
import { useTaskMutations } from "../app/(app)/tasks/use-task-mutations.ts";
import { useNewTaskDraft } from "../app/(app)/tasks/use-new-task-draft.ts";
import { restoreRemovedItems } from "../app/(app)/tasks/optimistic-list.ts";

beforeEach((t) => {
  const request = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected transport: mutation tests must mock the API.");
  });
  t.after(() => assert.equal(request.mock.callCount(), 0));
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const task = (id = "one", extra = {}) => ({
  id,
  team_id: "team",
  title: id,
  status: "todo",
  priority: "medium",
  flagged: false,
  updated_at: "2026-10-11T00:00:00Z",
  ...extra,
});
// Capture actual hook callbacks without mounting effects or making live calls.
function capture(hook, initialize) {
  let value;
  function Capture() {
    value = hook();
    initialize?.(value);
    return null;
  }
  renderToString(
    React.createElement(
      AppRouterContext.Provider,
      {
        value: { replace: () => {} },
      },
      React.createElement(Capture)
    )
  );
  return value;
}
function harness() {
  let tasks = [task(), task("two")];
  let selected = "two";
  const setTasks = (update) => {
    tasks = typeof update === "function" ? update(tasks) : update;
  };
  const mutations = capture(() => {
    const { run } = useAsyncError();
    return useTaskMutations({
      teamId: "team",
      setTasks,
      setSelectedTaskId: (update) => {
        selected = typeof update === "function" ? update(selected) : update;
      },
      run,
    });
  });
  return { mutations, getTasks: () => tasks, setTasks, getSelected: () => selected };
}

test("task writes serialize full-snapshot responses while unrelated tasks remain independent", async (t) => {
  const pending = [];
  t.mock.method(
    api,
    "updateTask",
    (id, patch) => new Promise((resolve) => pending.push({ id, patch, resolve }))
  );
  const { mutations, getTasks } = harness();
  const first = mutations.updateTaskField("one", { title: "Renamed" });
  const second = mutations.updateTaskField("one", { priority: "high" });
  const other = mutations.updateTaskField("two", { title: "Other" });
  await tick();
  assert.deepEqual(
    pending.map((request) => request.id),
    ["one", "two"]
  );
  pending[0].resolve(task("one", { title: "Renamed", updated_at: "2026-10-11T00:00:01Z" }));
  pending[1].resolve(task("two", { title: "Other" }));
  await tick();
  assert.deepEqual(pending[2].patch, { priority: "high" });
  pending[2].resolve(
    task("one", { title: "Renamed", priority: "high", updated_at: "2026-10-11T00:00:02Z" })
  );
  await Promise.all([first, second, other]);
  assert.equal(getTasks()[0].title, "Renamed");
  assert.equal(getTasks()[0].priority, "high");
  assert.equal(getTasks()[1].title, "Other");
});

test("repeated pending flag clicks coalesce into one non-idempotent request", async (t) => {
  let resolve;
  const request = t.mock.method(
    api,
    "flagTask",
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { mutations, getTasks } = harness();
  const first = mutations.toggleFlag(task());
  const duplicate = mutations.toggleFlag(task());
  await tick();
  assert.equal(request.mock.callCount(), 1);
  resolve(task("one", { flagged: true }));
  await Promise.all([first, duplicate]);
  assert.equal(getTasks()[0].flagged, true);
});

test("a failed task mutation releases ordering without retrying or blocking the next command", async (t) => {
  const request = t.mock.method(api, "updateTask", async (_id, patch) => {
    if (patch.title) throw { error: "service_unavailable", message: "private", status: 503 };
    return task("one", { priority: "high" });
  });
  const { mutations, getTasks } = harness();
  await Promise.all([
    mutations.updateTaskField("one", { title: "Failed" }),
    mutations.updateTaskField("one", { priority: "high" }),
  ]);
  assert.equal(request.mock.callCount(), 2);
  assert.equal(getTasks()[0].title, "one");
  assert.equal(getTasks()[0].priority, "high");
});

test("an older HTTP mutation response cannot replace a newer SSE row", async (t) => {
  let resolve;
  t.mock.method(
    api,
    "updateTask",
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { mutations, setTasks, getTasks } = harness();
  const pending = mutations.updateTaskField("one", { title: "HTTP" });
  await tick();
  setTasks([task("one", { title: "SSE", updated_at: "2026-10-11T00:00:03Z" })]);
  resolve(task("one", { title: "HTTP", updated_at: "2026-10-11T00:00:02Z" }));
  await pending;
  assert.equal(getTasks()[0].title, "SSE");
});

test("successful delete skips queued writes to the deleted row and preserves another selected drawer", async (t) => {
  const remove = t.mock.method(api, "deleteTask", async () => undefined);
  const update = t.mock.method(api, "updateTask", async () => {
    throw new Error("deleted task must not be updated");
  });
  const { mutations, getTasks, getSelected } = harness();
  await Promise.all([
    mutations.removeTask("one"),
    mutations.removeTask("one"),
    mutations.updateTaskField("one", { title: "Too late" }),
  ]);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 0);
  assert.deepEqual(
    getTasks().map((row) => row.id),
    ["two"]
  );
  assert.equal(getSelected(), "two");
});

test("failed optimistic deletion restores only its rows without undoing other edits, additions or deletions", () => {
  const before = [
    { id: "a", body: "A" },
    { id: "b", body: "B" },
    { id: "c", body: "C" },
  ];
  const current = [
    { id: "c", body: "Edited" },
    { id: "new", body: "New" },
  ];
  const restored = restoreRemovedItems(current, before, new Set(["a"]));
  assert.deepEqual(restored, [before[0], current[0], current[1]]);
  assert.deepEqual(restoreRemovedItems(restored, before, new Set(["a"])), restored);
});

test("failed comment cascade restores the parent and replies in order without resurrecting unrelated deletions", () => {
  const before = [{ id: "root" }, { id: "reply" }, { id: "other" }, { id: "tail" }];
  const current = [{ id: "tail", edited: true }, { id: "new" }];
  assert.deepEqual(restoreRemovedItems(current, before, new Set(["root", "reply"])), [
    before[0],
    before[1],
    current[0],
    current[1],
  ]);
});

test("creation commits once and preserves the known task when attachments and final refresh fail", async (t) => {
  let resolve;
  const create = t.mock.method(
    api,
    "createTeamTask",
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const uploads = t.mock.method(api, "uploadAttachment", async () => {
    throw { error: "storage_unavailable", message: "private", status: 503 };
  });
  const refresh = t.mock.method(api, "getTask", async () => {
    throw { error: "service_unavailable", message: "private", status: 503 };
  });
  let tasks = [];
  const draft = capture(
    () => {
      const { run } = useAsyncError();
      return useNewTaskDraft({
        teamId: "team",
        run,
        setTasks: (update) => {
          tasks = typeof update === "function" ? update(tasks) : update;
        },
      });
    },
    (value) => {
      if (!value.newTitle) {
        value.setNewTitle("New task");
        value.setNewFiles([{ name: "a.png" }]);
      }
    }
  );
  let prevented = 0;
  const event = {
    preventDefault: () => {
      prevented++;
    },
  };
  const first = draft.createTaskFromModal(event);
  const duplicate = draft.createTaskFromModal(event);
  assert.equal(create.mock.callCount(), 1);
  resolve(task("created", { title: "New task" }));
  await Promise.all([first, duplicate]);
  assert.equal(prevented, 2);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(uploads.mock.callCount(), 1);
  assert.equal(refresh.mock.callCount(), 1);
  assert.deepEqual(
    tasks.map((row) => row.id),
    ["created"]
  );
});

// Inspect callbacks on the actual Settings element tree; child effects and
// external providers stay unmounted. Every endpoint remains mocked.
function findElement(tree, predicate) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  } else if (React.isValidElement(tree)) {
    if (predicate(tree)) return tree;
    return findElement(tree.props.children, predicate);
  }
}

async function settingsHarness() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { getDefaultStore } = require("jotai");
  const { containersAtom } = await import("../lib/containers.ts");
  const { setSessionUser } = await import("../lib/session.ts");
  const { SettingsView } = await import("../app/(app)/settings/settings-view.tsx");
  const user = {
    id: "user",
    username: "kai",
    display_name: "Kai",
    created_at: "2026-10-11",
    password_login_enabled: true,
    username_claimed: true,
    tour_state: null,
    tour_resolved_at: null,
  };
  setSessionUser(user);
  getDefaultStore().set(containersAtom, [{ id: "team", role: "owner" }]);
  return { tree: capture(() => SettingsView({ contactEmail: null })), user };
}

test("profile duplicate submissions are blocked before render and a failure releases the guard", async (t) => {
  const { tree, user } = await settingsHarness();
  const { ProfileTile } = await import("../app/(app)/settings/ProfileTile.tsx");
  const profile = findElement(tree, (element) => element.type === ProfileTile);
  const profileTree = capture(() => ProfileTile(profile.props));
  const form = findElement(profileTree, (element) => element.type === "form");
  let reject;
  const request = t.mock.method(
    api,
    "updateMe",
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const first = form.props.onSubmit({ preventDefault: () => {} });
  await form.props.onSubmit({ preventDefault: () => {} });
  assert.equal(request.mock.callCount(), 1);
  reject({ error: "service_unavailable", message: "private", status: 503 });
  await first;
  request.mock.mockImplementation(async () => ({ user }));
  await form.props.onSubmit({ preventDefault: () => {} });
  assert.equal(request.mock.callCount(), 2);
});

test("checkout and portal actions share a synchronous guard and create only one navigation", async (t) => {
  const { tree } = await settingsHarness();
  const billing = findElement(tree, (element) => typeof element.props.onUpgrade === "function");
  const previousWindow = globalThis.window;
  const navigations = [];
  globalThis.window = { location: { assign: (url) => navigations.push(url) } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  let resolve;
  const checkout = t.mock.method(
    api,
    "startCheckout",
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const portal = t.mock.method(api, "billingPortal", async () => {
    throw new Error("must not overlap checkout");
  });
  const first = billing.props.onUpgrade();
  await billing.props.onManage();
  await billing.props.onUpgrade();
  assert.equal(checkout.mock.callCount(), 1);
  assert.equal(portal.mock.callCount(), 0);
  resolve({ url: "https://checkout.example.test/session" });
  await first;
  assert.deepEqual(navigations, ["https://checkout.example.test/session"]);
});
