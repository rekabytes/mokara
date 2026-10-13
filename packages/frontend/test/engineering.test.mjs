import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { createRequire } from "node:module";
// Match tsx's CommonJS resolution for this package (which has no type:module).
const require = createRequire(import.meta.url);
const { createStore, getDefaultStore } = require("jotai");
const { RESET } = require("jotai/utils");
import { useNotifications } from "../lib/notifications.ts";
import { useAsyncError } from "../hooks/useAsyncError.ts";
import { api } from "../lib/api.ts";
import {
  notificationListAtom,
  notificationUnreadAtom,
  notificationReadAtom,
  notificationReceivedAtom,
  notificationErrorAtom,
} from "../lib/notification-state.ts";
import {
  attachmentSchema,
  commentsSchema,
  notificationSchema,
  parseResponse,
} from "../lib/api-validation.ts";

const notification = (id = "one") => ({
  id,
  type: "task_assigned",
  payload: { task_id: "task" },
  read_at: null,
  created_at: "2026-10-11T00:00:00Z",
});
const store = getDefaultStore();

// Render only to obtain real hook callbacks in a router context. Effects are
// intentionally not mounted; every request below uses a mocked fetch.
function captureHook(hook) {
  let value;
  const redirects = [];
  function Capture() {
    value = hook();
    return null;
  }
  renderToString(
    React.createElement(
      AppRouterContext.Provider,
      {
        value: { replace: (path) => redirects.push(path) },
      },
      React.createElement(Capture)
    )
  );
  return { value, redirects };
}

beforeEach(() => {
  store.set(notificationListAtom, [notification()]);
  store.set(notificationUnreadAtom, 1);
  store.set(notificationErrorAtom, RESET);
});

test("failed read mutation leaves notification list/count intact and reports a shared error", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "service_unavailable", message: "private diagnostics" }, { status: 503 })
  );
  t.mock.method(console, "error", () => {});
  const { value } = captureHook(useNotifications);
  assert.equal(await value.markRead("one"), false);
  assert.equal(store.get(notificationUnreadAtom), 1);
  assert.equal(store.get(notificationListAtom)[0].read_at, null);
  assert.equal(store.get(notificationErrorAtom).retryable, true);
});

test("repeated successful reads and SSE echoes do not double-decrement or increment", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ marked: 1 }));
  const { value } = captureHook(useNotifications);
  await Promise.all([value.markRead("one"), value.markRead("one")]);
  assert.equal(store.get(notificationUnreadAtom), 0);
  const local = createStore();
  local.set(notificationReceivedAtom, notification());
  local.set(notificationReceivedAtom, notification());
  assert.equal(local.get(notificationUnreadAtom), 1);
  local.set(notificationReadAtom, "one");
  local.set(notificationReadAtom, "one");
  local.set(notificationReceivedAtom, { ...notification(), read_at: "2026-10-11" });
  assert.equal(local.get(notificationUnreadAtom), 0);
});

test("mark all retains server-wide semantics and reconciles notifications arriving during the request", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, body: init?.body });
    return url.endsWith("/read")
      ? Response.json({ marked: 80 })
      : Response.json({ notifications: [notification("new")], unread_count: 1 });
  });
  const { value } = captureHook(useNotifications);
  await value.markAllRead();
  assert.deepEqual(JSON.parse(calls[0].body), { ids: null });
  assert.equal(store.get(notificationUnreadAtom), 1);
  assert.equal(store.get(notificationListAtom)[0].id, "new");
});

test("superseded snapshot cannot overwrite the latest notification load", async (t) => {
  const pending = [];
  t.mock.method(
    globalThis,
    "fetch",
    (_url, init) => new Promise((resolve) => pending.push({ resolve, signal: init.signal }))
  );
  const { value } = captureHook(useNotifications);
  const first = value.load();
  const second = value.load();
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(Response.json({ notifications: [notification("new")], unread_count: 3 }));
  await second;
  pending[0].resolve(Response.json({ notifications: [notification("old")], unread_count: 9 }));
  await first;
  assert.equal(store.get(notificationListAtom)[0].id, "new");
  assert.equal(store.get(notificationUnreadAtom), 3);
});

test("cancelled operations neither redirect nor report obsolete errors or results", async () => {
  const { value, redirects } = captureHook(useAsyncError);
  const controller = new AbortController();
  let reject;
  let reported = false;
  const pending = value.run(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    {
      signal: controller.signal,
      onError: () => {
        reported = true;
      },
    }
  );
  controller.abort();
  reject({ error: "not_authenticated", message: "expired", status: 401 });
  assert.equal(await pending, null);
  assert.equal(reported, false);
  assert.deepEqual(redirects, []);
  let called = false;
  assert.equal(
    await value.run(
      async () => {
        called = true;
        return "stale";
      },
      { signal: controller.signal }
    ),
    null
  );
  assert.equal(called, false);
});

test("uncancelled session failures still use central login routing", async () => {
  const { value, redirects } = captureHook(useAsyncError);
  await value.run(async () => {
    throw { error: "not_authenticated", message: "expired", status: 401 };
  });
  assert.deepEqual(redirects, ["/login"]);
});

test("transport cancellation is preserved without a network error log", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    init.signal.throwIfAborted();
    throw new Error("unexpected test request");
  });
  const logging = t.mock.method(console, "error", () => {});
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.listComments("task", controller.signal), { name: "AbortError" });
  assert.equal(logging.mock.callCount(), 0);
});

test("invalid bodies and malformed successful responses use safe invalid-response failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ notifications: [notification()], unread_count: "bad" })
  );
  await assert.rejects(api.listNotifications(), (error) => error.error === "invalid_response");
  assert.equal(
    notificationSchema.safeParse({ ...notification(), payload: { overdue: "yes" } }).success,
    false
  );
  assert.throws(
    () => parseResponse(commentsSchema, { comments: [{ id: "one" }] }),
    (error) => error.error === "invalid_response"
  );
});

test("comment attachments accept the backend's nullable task_id contract", () => {
  const file = {
    id: "file",
    task_id: null,
    comment_id: "comment",
    filename: "a.png",
    size_bytes: 1,
    content_type: "image/png",
    uploader: { id: "user", username: "user", display_name: null },
    created_at: "2026-10-11",
  };
  assert.equal(attachmentSchema.safeParse(file).success, true);
});

test("invalid JSON and invalid mutation envelopes cannot produce success state", async (t) => {
  const response = t.mock.method(globalThis, "fetch", async () => new Response("{broken"));
  await assert.rejects(api.listNotifications(), (error) => error.error === "invalid_response");
  response.mock.mockImplementation(async () => Response.json({ marked: "one" }));
  const { value } = captureHook(useNotifications);
  assert.equal(await value.markRead("one"), false);
  assert.equal(store.get(notificationUnreadAtom), 1);
  assert.equal(store.get(notificationListAtom)[0].read_at, null);
  assert.equal(store.get(notificationErrorAtom).code, "invalid_response");
});

test("browser logs omit raw provider details", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "internal_error", message: "SECRET provider-body" }, { status: 500 })
  );
  const logging = t.mock.method(console, "error", () => {});
  await assert.rejects(api.listNotifications());
  assert.equal(JSON.stringify(logging.mock.calls).includes("SECRET"), false);
});

test("session expiry resumes a validated consent flow after sign-in", async () => {
  const { value, redirects } = captureHook(useAsyncError);
  const from = "/mcp/authorize?request=opaque";
  await value.run(
    async () => {
      throw { error: "not_authenticated", message: "expired", status: 401 };
    },
    { loginFrom: from }
  );
  assert.deepEqual(redirects, [`/login?from=${encodeURIComponent(from)}`]);
  await value.run(
    async () => {
      throw { error: "not_authenticated", message: "expired", status: 401 };
    },
    { loginFrom: "//external.example" }
  );
  assert.equal(redirects[1], "/login?from=%2Ftasks");
});
