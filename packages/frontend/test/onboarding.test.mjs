import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOUR_STEPS,
  atWalkthroughEnd,
  firstVisibleIndex,
  resolvedTourIndex,
  shouldRunTour,
} from "../lib/onboarding.ts";
import { loadTurnstile } from "../lib/turnstile.ts";
import { api } from "../lib/api.ts";

const progress = (extra = {}) => ({ taskCount: 0, modalOpen: false, taskOpen: false, ...extra });
const indexOf = (id) => TOUR_STEPS.findIndex((step) => step.id === id);

test("automatic tour progress follows form and drawer transitions without ending at a temporary gate", () => {
  const create = TOUR_STEPS.findIndex((step) => step.waitFor === "modal-open");
  const submit = TOUR_STEPS.findIndex((step) => step.waitFor === "task-created");
  const open = TOUR_STEPS.findIndex((step) => step.waitFor === "task-opened");
  assert.equal(resolvedTourIndex(TOUR_STEPS, create, progress()), create);
  const insideForm = resolvedTourIndex(TOUR_STEPS, create, progress({ modalOpen: true }));
  assert.ok(insideForm > create && insideForm < submit);
  assert.equal(resolvedTourIndex(TOUR_STEPS, submit, progress({ modalOpen: true })), submit);
  assert.equal(atWalkthroughEnd(TOUR_STEPS, submit), false);
  assert.equal(resolvedTourIndex(TOUR_STEPS, submit, progress({ taskCount: 1 })), open);
  const insideDrawer = resolvedTourIndex(
    TOUR_STEPS,
    open,
    progress({ taskCount: 1, taskOpen: true })
  );
  assert.equal(insideDrawer, indexOf("drawer-title"));
  const board = resolvedTourIndex(TOUR_STEPS, insideDrawer, progress({ taskCount: 1 }));
  assert.equal(board, indexOf("board-controls"));
});

test("tour resolution is bounded, preserves temporary exhaustion, and never skips a LOOK step", () => {
  const first = firstVisibleIndex(TOUR_STEPS, progress({ taskCount: 3 }));
  assert.equal(resolvedTourIndex(TOUR_STEPS, first, progress({ taskCount: 3 })), first);
  const steps = [
    { ...TOUR_STEPS[0], waitFor: "task-opened" },
    { ...TOUR_STEPS[0], when: () => false },
  ];
  assert.equal(resolvedTourIndex(steps, 0, progress({ taskOpen: true })), 0);
  assert.equal(resolvedTourIndex([], -1, progress()), -1);
  const satisfied = Array.from({ length: 100 }, () => ({
    ...TOUR_STEPS[0],
    waitFor: "task-opened",
  }));
  assert.equal(resolvedTourIndex(satisfied, 0, progress({ taskOpen: true })), 99);
});

test("tour gates fail closed for unresolved sessions, failed board reads, and mobile", () => {
  const gate = {
    authed: true,
    tourState: null,
    pathname: "/tasks",
    boardReady: true,
    viewportWidth: 1280,
    dismissed: false,
  };
  assert.equal(shouldRunTour(gate), true);
  for (const change of [
    { authed: false },
    { tourState: undefined },
    { boardReady: false },
    { viewportWidth: 799 },
    { dismissed: true },
  ]) {
    assert.equal(shouldRunTour({ ...gate, ...change }), false);
  }
});

test("Turnstile deduplicates script reads, clears failed lifetimes, and retries without stale callbacks", async (t) => {
  const scripts = [];
  const timers = new Map();
  let nextTimer = 0;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      setTimeout: (fn) => {
        timers.set(++nextTimer, fn);
        return nextTimer;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement: () => ({
        remove() {
          this.removed = true;
        },
      }),
      head: { append: (script) => scripts.push(script) },
    },
    configurable: true,
  });
  const first = loadTurnstile();
  const failed = assert.rejects(first, /Verification could not load/);
  assert.equal(loadTurnstile(), first);
  const staleLoad = scripts[0].onload;
  scripts[0].onerror();
  await failed;
  assert.equal(timers.size, 0);
  assert.equal(scripts[0].removed, true);
  assert.equal(scripts[0].onload, null);
  const retry = loadTurnstile();
  staleLoad();
  assert.equal(loadTurnstile(), retry);
  assert.equal(scripts.length, 2);
  window.turnstile = { render() {}, remove() {} };
  scripts[1].onload();
  assert.equal(await retry, window.turnstile);
  assert.equal(timers.size, 0);
  assert.equal(scripts[1].onerror, null);
  assert.equal(await loadTurnstile(), window.turnstile);
});

test("signup configuration abort signal reaches transport without waiting for timeout", async (t) => {
  const controller = new AbortController();
  const transport = t.mock.method(
    globalThis,
    "fetch",
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), {
          once: true,
        });
      })
  );
  const request = api.signupProtection(controller.signal);
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(transport.mock.callCount(), 1);
  assert.equal(transport.mock.calls[0].arguments[1].signal.aborted, true);
});
