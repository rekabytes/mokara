import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { NextRequest } from "next/server";
import { TicketForm } from "../app/ticket-form/[id]/TicketForm.tsx";
import { proxy } from "../proxy.ts";
import { api } from "../lib/api.ts";
import { supportEmbed, supportAccentInk } from "../lib/support-model.ts";
import { normalizeError } from "../lib/errors.ts";
const SITE = "33333333-3333-4333-8333-333333333333";
const config = {
  site: {
    id: SITE,
    name: "Northline",
    origins: ["https://shop.example.test"],
    accent: "#6366f1",
    greeting: "Report an issue or send a request.",
  },
  protection: { required: false, site_key: null },
  available: true,
  max_file_bytes: 3 * 1024 ** 2,
  max_files: 3,
};
test("ticket form matches the approved structured design and is not a chat launcher", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: { push: () => {}, replace: () => {} } },
      React.createElement(TicketForm, { config })
    )
  );
  for (const label of [
    "Submit a support ticket",
    "Request type",
    "Affected area",
    "Subject",
    "Details",
    "Attach screenshots or files",
    "Your name",
    "Email address",
    "Submit ticket",
    "Powered by Mokara",
  ])
    assert.ok(html.includes(label), label);
  assert.ok(html.includes('type="email"'));
  assert.ok(html.includes('maxLength="10000"'));
  assert.ok(!html.includes("Need help?"));
  assert.ok(!html.includes("chat"));
});
test("installation markup escapes attributes and uses supplied runtime URL", () => {
  const snippet = supportEmbed('https://configured.example.test/ticket-form/id?x="&y=<script>');
  assert.ok(snippet.includes("configured.example.test"));
  assert.ok(snippet.includes("&quot;"));
  assert.ok(snippet.includes("&lt;script&gt;"));
  assert.ok(snippet.includes('title="Submit a support ticket"'));
  assert.ok(!snippet.includes("mokara.my"));
  assert.equal(supportAccentInk("#ffffff"), "#000000");
  assert.equal(supportAccentInk("#111111"), "#ffffff");
});
test("frame permission is limited to configured website origins; private ticket pages stay protected", async (t) => {
  const previous = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "https://backend.example.test";
  t.after(() => {
    if (previous === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previous;
  });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.ok(String(url).startsWith(process.env.BACKEND_URL));
    assert.equal(init.cache, "no-store");
    return Response.json(config);
  });
  const framed = await proxy(new NextRequest(`https://app.example.test/ticket-form/${SITE}`));
  assert.equal(framed.headers.get("X-Frame-Options"), null);
  assert.ok(
    framed.headers
      .get("Content-Security-Policy")
      .includes("frame-ancestors https://shop.example.test")
  );
  assert.equal(framed.headers.get("Referrer-Policy"), "no-referrer");
  assert.ok(framed.headers.get("X-Robots-Tag").includes("noindex"));
  const privatePage = await proxy(
    new NextRequest(`https://app.example.test/support-ticket/${SITE}`)
  );
  assert.equal(privatePage.headers.get("X-Frame-Options"), "DENY");
});
test("failed embed discovery fails closed and the team inbox requires sign in", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Private upstream failure");
  });
  const response = await proxy(new NextRequest(`https://app.example.test/ticket-form/${SITE}`));
  assert.ok(response.headers.get("Content-Security-Policy").endsWith("frame-ancestors 'none'"));
  const denied = await proxy(new NextRequest("https://app.example.test/support"));
  assert.equal(denied.status, 307);
  assert.ok(denied.headers.get("location").includes("/login?from=%2Fsupport"));
});
test("customer API sends capability only in headers and never uses browser cookies", async (t) => {
  const token = "a".repeat(43);
  let called = false;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    called = true;
    assert.ok(!String(url).includes(token));
    assert.equal(init.credentials, "omit");
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    return Response.json({
      ticket: {
        id: SITE,
        reference: "MK-TEST",
        subject: "Invoice",
        details: "Request",
        status: "open",
        created_at: "2026-10-17",
      },
      site_name: "Northline",
      messages: [],
      attachments: [],
      next_cursor: null,
    });
  });
  const data = await api.publicSupportTicket(SITE, token);
  assert.equal(data.ticket.status, "open");
  assert.ok(called);
});
test("support errors remain in the unified error path and do not redirect customers to login", () => {
  for (const code of ["support_access", "support_limit", "support_conflict", "support_unavailable"])
    assert.notEqual(
      normalizeError({ error: code, message: "Ticket unavailable", status: 403 }).action,
      "redirect"
    );
});

test("existing mDrive PDF preview framing remains same-origin", async () => {
  const response = await proxy(
    new NextRequest("https://app.example.test/api/teams/team/files/file/preview")
  );
  assert.equal(response.headers.get("X-Frame-Options"), "SAMEORIGIN");
});
