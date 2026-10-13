import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToString } from "react-dom/server";
import { api } from "../lib/api.ts";
import { containerMetaViewAtom, refreshContainerMeta } from "../lib/meta.ts";
import { refreshSession, setSessionUser, signOutServer, useSession } from "../lib/session.ts";
const require = createRequire(import.meta.url);
const { getDefaultStore } = require("jotai");
const store = getDefaultStore();
const tick = () => new Promise((resolve) => setImmediate(resolve));
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
function session() {
  let state;
  function Capture() {
    state = useSession();
    return null;
  }
  renderToString(React.createElement(Capture));
  return state;
}
function metadataMocks(t) {
  t.mock.method(api, "listKpis", async () => ({ kpis: [] }));
  t.mock.method(api, "getKpiProgress", async () => ({ kpis: [] }));
}

test("metadata refresh keeps cached rows, reports failures and recovers through official unwrap", async (t) => {
  metadataMocks(t);
  const project = { id: "project" };
  const request = t.mock.method(api, "listProjects", async () => ({ projects: [project] }));
  const view = containerMetaViewAtom("cache-recovery");
  const unsubscribe = store.sub(view, () => {});
  t.after(unsubscribe);
  await refreshContainerMeta("cache-recovery");
  await tick();
  assert.deepEqual(store.get(view).projects, [project]);
  assert.equal(store.get(view).loading, false);
  request.mock.mockImplementation(async () => {
    throw { error: "service_unavailable", message: "private upstream", status: 503 };
  });
  const refresh = refreshContainerMeta("cache-recovery");
  assert.equal(store.get(view).loading, true);
  assert.deepEqual(store.get(view).projects, [project]);
  await refresh;
  await tick();
  assert.equal(store.get(view).error.retryable, true);
  assert.equal(store.get(view).error.message.includes("private"), false);
  assert.deepEqual(store.get(view).projects, [project]);
  request.mock.mockImplementation(async () => ({ projects: [] }));
  await refreshContainerMeta("cache-recovery");
  await tick();
  assert.equal(store.get(view).error, null);
  assert.deepEqual(store.get(view).projects, []);
});

test("superseded metadata reads cannot overwrite a newer refresh even when transport ignores abort", async (t) => {
  metadataMocks(t);
  const pending = [];
  t.mock.method(api, "listProjects", (_id, all, signal) => {
    assert.equal(all, true); // Archived rows must remain in the shared cache.
    return new Promise((resolve) => pending.push({ resolve, signal }));
  });
  const view = containerMetaViewAtom("race");
  const unsubscribe = store.sub(view, () => {});
  t.after(unsubscribe);
  const old = refreshContainerMeta("race");
  const latest = refreshContainerMeta("race");
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ projects: [{ id: "new" }] });
  await latest;
  pending[0].resolve({ projects: [{ id: "old" }] });
  await old;
  await tick();
  assert.equal(store.get(view).projects[0].id, "new");
});

test("metadata subscribers remain isolated from another container's refresh", async (t) => {
  metadataMocks(t);
  t.mock.method(api, "listProjects", async () => ({ projects: [] }));
  const view = containerMetaViewAtom("isolated");
  let updates = 0;
  const unsubscribe = store.sub(view, () => {
    updates++;
  });
  t.after(unsubscribe);
  await refreshContainerMeta("other");
  await tick();
  assert.equal(updates, 0);
  assert.equal(store.get(view).loading, false);
});

test("session outages remain retryable while an expired session becomes anonymous", async (t) => {
  const request = t.mock.method(api, "me", async () => {
    throw { error: "service_unavailable", message: "private", status: 503 };
  });
  await refreshSession();
  assert.equal(session().status, "error");
  assert.equal(session().error.retryable, true);
  request.mock.mockImplementation(async () => ({ user }));
  await refreshSession();
  assert.equal(session().status, "authed");
  request.mock.mockImplementation(async () => {
    throw { error: "not_authenticated", message: "expired", status: 401 };
  });
  await refreshSession();
  assert.equal(session().status, "anonymous");
});

test("an obsolete session probe cannot replace a successful login", async (t) => {
  let reject;
  let signal;
  t.mock.method(api, "me", (nextSignal) => {
    signal = nextSignal;
    return new Promise((_resolve, fail) => {
      reject = fail;
    });
  });
  const probe = refreshSession();
  setSessionUser(user);
  assert.equal(signal.aborted, true);
  reject({ error: "not_authenticated", message: "expired", status: 401 });
  await probe;
  assert.equal(session().status, "authed");
  assert.equal(session().user.id, user.id);
});

test("a failed sign-out propagates to the shared action handler and leaves session state intact", async (t) => {
  setSessionUser(user);
  t.mock.method(api, "logout", async () => {
    throw { error: "network_error", message: "offline", status: 0 };
  });
  await assert.rejects(signOutServer(), (error) => error.error === "network_error");
  assert.equal(session().status, "authed");
});

test("metadata and session response boundaries reject invalid successful bodies", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ projects: [{ id: "bad" }] }));
  await assert.rejects(api.listProjects("team"), (error) => error.error === "invalid_response");
  await assert.rejects(api.me(), (error) => error.error === "invalid_response");
});

test("KPI progress validates the backend payload without requiring an absent scope field", async (t) => {
  const progress = {
    id: "kpi",
    name: "Delivery",
    owner_username: "kai",
    task_count: 1,
    weight_sum: 50,
    progress: 100,
  };
  t.mock.method(globalThis, "fetch", async () => Response.json({ kpis: [progress] }));
  assert.deepEqual(await api.getKpiProgress("team"), { kpis: [progress] });
});
