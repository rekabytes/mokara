import { test } from "node:test";
import assert from "node:assert/strict";
import { Script, runInNewContext } from "node:vm";
import { changelogRoutes, releases } from "../src/routes/changelog.ts";
import { ADMIN_JS } from "../../admin/src/assets.ts";
import { overviewPage, loginPage } from "../../admin/src/pages.ts";
const latestVersion = releases[0].version;

test("changelog serves curated public notes without private data", async () => {
  const answer = await changelogRoutes.request("/");
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("cache-control"), "no-store");
  const data = await answer.json();
  assert.deepEqual(data, { releases });
  assert.doesNotMatch(
    JSON.stringify(data),
    /token|secret|encryption|database|migration|AUTH_|SUPPORT_/i
  );
});
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = "";
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  append(...c) {
    this.children.push(...c);
  }
  replaceChildren(...c) {
    this.children = c;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  addEventListener(k, f) {
    this.listeners[k] = f;
  }
  text() {
    return this.textContent + this.children.map((c) => c.text()).join(" ");
  }
}
async function renderAdmin({ dismissed, fail = false, invalid = false } = {}) {
  const nodes = Object.fromEntries(
    ["app", "notice", "content", "release-panel", "release-open", "release-dialog"].map((k) => [
      k,
      new Element("div"),
    ])
  );
  nodes.app.dataset.view = "unused";
  const saved = new Map(dismissed ? [["mokara:admin:release-notice", dismissed]] : []);
  const timers = new Map();
  let timerId = 0;
  runInNewContext(ADMIN_JS, {
    setTimeout: (fn, delay) => {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    document: {
      getElementById: (id) => nodes[id],
      createElement: (tag) => new Element(tag),
      createElementNS: (_ns, tag) => new Element(tag),
    },
    window: {
      localStorage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) },
    },
    fetch: async () => {
      if (fail) throw new Error("offline");
      return {
        ok: true,
        status: 200,
        json: async () => (invalid ? { releases: [{}] } : structuredClone({ releases })),
      };
    },
  });
  await new Promise((r) => setImmediate(r));
  return { nodes, saved, timers };
}
test("admin corner notice opens a modal, persists closure and reopens from its button", async () => {
  new Script(ADMIN_JS);
  assert.match(overviewPage(), /id="release-open"/);
  assert.doesNotMatch(loginPage("test"), /id="release-open"/);
  const { nodes, saved, timers } = await renderAdmin();
  const panel = nodes["release-panel"],
    dialog = nodes["release-dialog"];
  assert.equal(panel.hidden, false);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 30_000);
  panel.children[0].children[0].listeners.click();
  assert.equal(dialog.open, true);
  assert.equal(panel.hidden, true);
  assert.equal(timers.size, 0);
  assert.match(dialog.text(), /Ready for agent/);
  const entries = dialog.children[1].children.filter((child) => child.tag === "details");
  assert.equal(entries.length, releases.length);
  assert.equal(entries[0].open, true);
  assert.equal(
    entries.slice(1).some((entry) => entry.open),
    false
  );
  assert.match(dialog.text(), /0.1.0/);
  dialog.children[0].children[1].listeners.click();
  assert.equal(dialog.open, false);
  assert.equal(saved.get("mokara:admin:release-notice"), latestVersion);
  const revisit = await renderAdmin({ dismissed: latestVersion });
  assert.equal(revisit.nodes["release-panel"].hidden, true);
  revisit.nodes["release-open"].listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.equal(revisit.nodes["release-dialog"].open, true);
  const next = await renderAdmin({ dismissed: "0.2.17" });
  assert.equal(next.nodes["release-panel"].hidden, false);
});
test("admin notice X and timeout only hide the corner card", async () => {
  const closed = await renderAdmin();
  closed.nodes["release-panel"].children[0].children[1].listeners.click();
  assert.equal(closed.nodes["release-panel"].hidden, true);
  assert.notEqual(closed.nodes["release-dialog"].open, true);
  assert.equal(closed.timers.size, 0);
  const ignored = await renderAdmin();
  [...ignored.timers.values()][0].fn();
  assert.equal(ignored.nodes["release-panel"].hidden, true);
  assert.notEqual(ignored.nodes["release-dialog"].open, true);
});
test("admin release failures leave a working retry control", async () => {
  for (const options of [{ fail: true }, { invalid: true }]) {
    const { nodes } = await renderAdmin(options);
    assert.match(nodes.notice.text(), /Couldn't load release notes/);
    assert.equal(nodes["release-open"].disabled, false);
  }
});

test("release history includes the published versions in descending order", () => {
  const versions = releases.map((release) => release.version);
  const published = [
    ...Array.from({ length: 10 }, (_, i) => `0.1.${i}`),
    ...Array.from({ length: 19 }, (_, i) => `0.2.${i}`).filter((version) => version !== "0.2.2"),
  ];
  for (const version of published) assert.ok(versions.includes(version), version);
  assert.equal(new Set(versions).size, versions.length);
  const descending = [...versions]
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .reverse();
  assert.deepEqual(versions, descending);
});
