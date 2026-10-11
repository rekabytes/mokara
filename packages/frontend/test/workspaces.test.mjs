import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createRequire } from "node:module";
import { api } from "../lib/api.ts";
import {
  useContainers,
  containersAtom,
  selectedContainerIdAtom,
  containersErrorAtom,
} from "../lib/containers.ts";
import { GET as proxy } from "../app/api/[...path]/route.ts";
const require = createRequire(import.meta.url);
const { getDefaultStore } = require("jotai");
const store = getDefaultStore();
const tick = () => new Promise((resolve) => setImmediate(resolve));
const team = (id) => ({ id, name: id, kind: "workspace", role: "owner" });
function capture() {
  let value;
  function Capture() {
    value = useContainers();
    return null;
  }
  renderToString(React.createElement(Capture));
  return value;
}
beforeEach((t) => {
  store.set(containersAtom, [team("old")]);
  store.set(selectedContainerIdAtom, "old");
  store.set(containersErrorAtom, null);
  const transport = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected live transport");
  });
  t.after(() => assert.equal(transport.mock.callCount(), 0));
  t.mock.method(api, "setLastContainer", async () => {});
});

test("an obsolete workspace snapshot cannot erase a confirmed creation", async (t) => {
  let resolveRead, signal;
  t.mock.method(api, "listTeams", (value) => {
    signal = value;
    return new Promise((resolve) => {
      resolveRead = resolve;
    });
  });
  t.mock.method(api, "createTeam", async () => ({ team: team("new") }));
  const containers = capture();
  const read = containers.load();
  await containers.create("New", "workspace");
  assert.equal(signal.aborted, true);
  resolveRead({ teams: [team("old")], last_container_id: "old" });
  await read;
  await tick();
  assert.deepEqual(
    store.get(containersAtom).map((row) => row.id),
    ["new", "old"]
  );
  assert.equal(store.get(selectedContainerIdAtom), "new");
});

test("newer workspace reads win even if an obsolete transport ignores cancellation", async (t) => {
  const reads = [];
  t.mock.method(
    api,
    "listTeams",
    (signal) => new Promise((resolve, reject) => reads.push({ resolve, reject, signal }))
  );
  const containers = capture();
  const older = containers.load();
  const newer = containers.load();
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve({ teams: [team("latest")], last_container_id: null });
  await newer;
  reads[0].reject({ error: "service_unavailable", status: 503, message: "obsolete" });
  await older;
  assert.deepEqual(store.get(containersAtom), [team("latest")]);
  assert.equal(store.get(containersErrorAtom), null);
});

test("overlapping empty-workspace reads share the already-started legacy creation", async (t) => {
  t.mock.method(api, "listTeams", async () => ({ teams: [], last_container_id: null }));
  let finish;
  const creation = t.mock.method(
    api,
    "createTeam",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const containers = capture();
  const older = containers.load();
  await tick();
  const newer = containers.load();
  await tick();
  assert.equal(creation.mock.callCount(), 1);
  finish({ team: team("personal") });
  await Promise.all([older, newer]);
  assert.deepEqual(store.get(containersAtom), [team("personal")]);
});

test("workspace preference writes preserve click order and recover after failure", async (t) => {
  const pending = [];
  t.mock.method(
    api,
    "setLastContainer",
    (id) => new Promise((resolve, reject) => pending.push({ id, resolve, reject }))
  );
  const containers = capture();
  containers.setSelectedId("first");
  containers.setSelectedId("last");
  assert.equal(store.get(selectedContainerIdAtom), "last");
  await tick();
  assert.deepEqual(
    pending.map((call) => call.id),
    ["first"]
  );
  pending[0].reject(new Error("preference failure"));
  await tick();
  assert.deepEqual(
    pending.map((call) => call.id),
    ["first", "last"]
  );
  pending[1].resolve();
  await tick();
});

// Separate from the no-transport hook tests: imported proxy uses mocked fetch.
test("proxy outages return the shared error envelope without logging upstream secrets", async (t) => {
  // The beforeEach transport guard remains unused: this second mock owns proxy traffic.
  const original = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "http://backend.invalid:4700";
  t.after(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private-upstream-token");
  });
  const log = t.mock.method(console, "error", () => {});
  const response = await proxy({
    method: "GET",
    nextUrl: new URL("https://mokara.invalid/api/teams"),
    headers: new Headers(),
    signal: new AbortController().signal,
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "network_error",
    message: "Backend unavailable",
  });
  assert.equal(log.mock.callCount(), 1);
  assert.equal(JSON.stringify(log.mock.calls).includes("private-upstream-token"), false);
});
