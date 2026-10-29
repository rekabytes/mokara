import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { TicketFormPreview } from "../components/support/TicketFormPreview.tsx";
import { SupportSiteEditor } from "../app/(app)/support/SupportSiteEditor.tsx";
import { SupportSites } from "../app/(app)/support/SupportSites.tsx";
import { SupportSetupSteps } from "../app/(app)/support/SupportSetupSteps.tsx";
import {
  initialSupportDraft,
  supportHex,
  supportSitePayload,
  supportOriginHint,
} from "../app/(app)/support/site-setup-model.ts";
const site = {
  id: "site",
  name: "Northline",
  origins: ["https://shop.example.test", "https://www.shop.example.test"],
  accent: "#15803d",
  greeting: "Tell us what happened.",
  enabled: false,
  form_url: "https://configured.example.test/ticket-form/site",
};
const render = (element) =>
  renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: { replace: () => {} } }, element)
  );
test("new drafts use safe defaults and editing retains the saved website configuration", () => {
  const empty = initialSupportDraft(null);
  assert.equal(empty.name, "");
  assert.equal(empty.originsText, "");
  assert.equal(empty.accent, "#6366F1");
  assert.equal(empty.enabled, true);
  const draft = initialSupportDraft(site);
  assert.equal(draft.accent, "#15803D");
  assert.deepEqual(supportSitePayload(draft, supportHex(draft.accent)), {
    name: site.name,
    origins: site.origins,
    accent: site.accent,
    button_text_color: null,
    greeting: site.greeting,
    enabled: false,
  });
});
test("hex typing allows incomplete edits without submitting invalid color values", () => {
  for (const value of ["#", "#abc", "#12345g", "red", ""]) assert.equal(supportHex(value), null);
  assert.equal(supportHex("#A1B2C3"), "#a1b2c3");
});
test("origin hints are derived from input and never silently rewrite saved origins", () => {
  const text = "  https://shop.example.test/help\nhttps://www.shop.example.test\n";
  assert.equal(supportOriginHint(text), "https://shop.example.test");
  assert.deepEqual(
    supportSitePayload({ ...initialSupportDraft(null), originsText: text }, "#6366f1").origins,
    ["https://shop.example.test/help", "https://www.shop.example.test"]
  );
  assert.equal(supportOriginHint("https://name:secret@shop.example.test"), null);
  assert.equal(supportOriginHint("javascript:alert(1)"), null);
});
test("preview reflects brand, introduction and paused state, escapes content and cannot submit", () => {
  const html = renderToStaticMarkup(React.createElement(TicketFormPreview, { site }));
  for (const label of [
    "Northline",
    "Tell us what happened.",
    "Request type",
    "Affected area",
    "Subject",
    "Details",
    "Your name",
    "Email address",
    "Submit ticket",
    "New tickets will be paused",
  ])
    assert.ok(html.includes(label), label);
  assert.match(html, /--color-accent:#15803d/);
  assert.match(html, /inert=""/);
  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /<form|type="file"/);
  const changed = renderToStaticMarkup(
    React.createElement(TicketFormPreview, {
      site: {
        ...site,
        name: "<script>not code</script>",
        accent: "#2563eb",
        greeting: "Updated introduction",
        enabled: true,
      },
    })
  );
  assert.ok(changed.includes("&lt;script&gt;"));
  assert.ok(changed.includes("Updated introduction"));
  assert.ok(changed.includes("--color-accent:#2563eb"));
  assert.ok(!changed.includes("will be paused"));
});
test("customer preview fields are outside the website form so required fields cannot block saving", () => {
  const html = render(
    React.createElement(SupportSiteEditor, {
      teamId: "team",
      site: null,
      onSaved: () => {},
      onCancel: () => {},
    })
  );
  const form = html.slice(html.indexOf("<form"), html.indexOf("</form>") + 7);
  assert.ok(form.includes('name="name"'));
  assert.ok(form.includes('name="accent"'));
  assert.ok(!form.includes('name="subject"'));
  assert.ok(!form.includes('name="customer_email"'));
  assert.ok(html.includes('type="color"'));
  assert.ok(html.includes("Brand accent presets"));
  assert.ok(html.includes("Read the setup guide"));
  assert.ok(!html.includes("mokara.my"));
});
test("setup stages and saved-site instructions do not claim copying installs or tests the form", () => {
  const steps = renderToStaticMarkup(React.createElement(SupportSetupSteps, { current: 2 }));
  assert.equal((steps.match(/aria-current="step"/g) ?? []).length, 1);
  const html = render(
    React.createElement(SupportSites, {
      teamId: "team",
      recentSiteId: site.id,
      onSaved: () => {},
      data: {
        sites: [site],
        owner: true,
        configured: true,
        usage: { sites: 1, site_limit: 3, tickets: 0, ticket_limit: 100 },
      },
    })
  );
  assert.ok(html.includes("Your website is saved"));
  assert.ok(html.includes("Copy embed"));
  assert.ok(html.includes("Send a test ticket"));
  assert.match(html, /<details[^>]*\bopen=""/);
  const viewer = render(
    React.createElement(SupportSites, {
      teamId: "team",
      recentSiteId: null,
      onSaved: () => {},
      data: {
        sites: [site],
        owner: false,
        configured: true,
        usage: { sites: 1, site_limit: 3, tickets: 0, ticket_limit: 100 },
      },
    })
  );
  assert.ok(!viewer.includes(">Add website</button>"));
  assert.ok(!viewer.includes(">Edit website</button>"));
});

test("white customer-button text retains at least 4.5:1 contrast for light and dark brand colors", async () => {
  const { supportButtonStyle } = await import("../lib/support-model.ts");
  for (const color of [
    "#6366f1",
    "#2563eb",
    "#15803d",
    "#475569",
    "#ffffff",
    "#ffff00",
    "#000000",
  ]) {
    const style = supportButtonStyle(color);
    assert.equal(style.color, "#ffffff");
    const rgb = [1, 3, 5].map(
      (i) => Number.parseInt(style.backgroundColor.slice(i, i + 2), 16) / 255
    );
    const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    assert.ok(1.05 / (luminance + 0.05) >= 4.5, color);
  }
});

test("custom button text colors are retained in edits and used exactly in the preview", async () => {
  const saved = { ...site, button_text_color: "#ffffff" };
  const draft = initialSupportDraft(saved);
  assert.equal(draft.buttonTextColor, "#FFFFFF");
  assert.equal(supportSitePayload(draft, "#15803d").button_text_color, "#ffffff");
  const { supportButtonStyle, supportContrastRatio } = await import("../lib/support-model.ts");
  assert.deepEqual(supportButtonStyle("#ffffff", "#0f172a"), {
    backgroundColor: "#ffffff",
    color: "#0f172a",
  });
  assert.equal(supportContrastRatio("#ffffff", "#ffffff"), 1);
  const html = renderToStaticMarkup(
    React.createElement(TicketFormPreview, { site: { ...site, button_text_color: "#ffffff" } })
  );
  assert.ok(html.includes("color:#ffffff"));
  const editor = render(
    React.createElement(SupportSiteEditor, {
      teamId: "team",
      site: saved,
      onSaved: () => {},
      onCancel: () => {},
    })
  );
  assert.ok(editor.includes("Button text presets"));
  assert.ok(editor.includes('name="button_text_color"'));
  assert.ok(editor.includes("Automatic"));
});
