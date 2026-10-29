import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { changelogSchema, hasNewRelease, isDismissedReleases } from "../lib/changelog.ts";
import { ReleaseNotes } from "../components/changelog/ReleaseNotes.tsx";
import { api } from "../lib/api.ts";
const feed = {
  releases: [
    {
      version: "0.2.18",
      date: "2026-10-29",
      title: "<script>unsafe</script>",
      summary: "A product update",
      changes: [{ title: "Ready for agent", body: "You choose which tasks an agent may run." }],
    },
  ],
};
test("dismissal is scoped to the account and exact version", () => {
  assert.equal(hasNewRelease({}, "alice", "0.2.18"), true);
  assert.equal(hasNewRelease({ alice: "0.2.18" }, "alice", "0.2.18"), false);
  assert.equal(hasNewRelease({ alice: "0.2.18" }, "bob", "0.2.18"), true);
  assert.equal(hasNewRelease({ alice: "0.2.17" }, "alice", "0.2.18"), true);
  assert.equal(hasNewRelease({}, "constructor", "0.2.18"), true);
  for (const v of [null, [], "version", { alice: 18 }]) assert.equal(isDismissedReleases(v), false);
  assert.equal(isDismissedReleases({ alice: "0.2.18" }), true);
});
test("contract validates and renders escaped notes", () => {
  assert.equal(changelogSchema.safeParse(feed).success, true);
  assert.equal(changelogSchema.safeParse({ releases: [{}] }).success, false);
  assert.equal(
    changelogSchema.safeParse({ releases: [{ ...feed.releases[0], date: "2026-02-31" }] }).success,
    false
  );
  const html = renderToStaticMarkup(React.createElement(ReleaseNotes, feed));
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /dateTime="2026-10-29"/);
  assert.match(html, /Ready for agent/);
  assert.doesNotMatch(html, /<script>/);
});
test("client uses existing transport and rejects malformed success", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, "/api/changelog");
      return Response.json(feed);
    };
    assert.deepEqual(await api.changelog(), feed);
    globalThis.fetch = async () => Response.json({ releases: [{}] });
    await assert.rejects(api.changelog());
  } finally {
    globalThis.fetch = original;
  }
});

test("release popup is compact, opens a dialog and has a separate close action", async () => {
  const { ReleaseToast } = await import("../components/changelog/ReleaseToast.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ReleaseToast, {
      release: feed.releases[0],
      onOpen: () => {},
      onDismiss: () => {},
    })
  );
  assert.match(html, /class="release-toast"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-label="Dismiss release notice"/);
  assert.match(html, /Read the update/);
  assert.doesNotMatch(html, /You choose which tasks/);
});
test("ignored popup hides after 30 seconds and unmount cancels its timer", async (t) => {
  const { scheduleNoticeDismissal } =
    await import("../components/changelog/release-notice-timing.ts");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let dismissed = 0;
  scheduleNoticeDismissal(() => {
    dismissed += 1;
  });
  t.mock.timers.tick(29_999);
  assert.equal(dismissed, 0);
  t.mock.timers.tick(1);
  assert.equal(dismissed, 1);
  const cancel = scheduleNoticeDismissal(() => {
    dismissed += 1;
  });
  cancel();
  t.mock.timers.tick(30_000);
  assert.equal(dismissed, 1);
});

test("history displays every release with the latest expanded and older entries readable on demand", async () => {
  const { releases } = await import("../../backend/src/routes/changelog.ts");
  assert.equal(changelogSchema.safeParse({ releases }).success, true);
  const html = renderToStaticMarkup(React.createElement(ReleaseNotes, { releases }));
  assert.equal((html.match(/<details /g) ?? []).length, releases.length);
  assert.equal((html.match(/ open=""/g) ?? []).length, 1);
  assert.match(html, /v0.1.0/);
  assert.match(html, /v0.2.18/);
  assert.match(html, /Release history/);
});
