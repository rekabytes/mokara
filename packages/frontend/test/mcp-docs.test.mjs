import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import guideModule from "../app/(marketing)/docs/mcp/page.tsx";
import { getMcpConnectionUrl } from "../app/(marketing)/docs/mcp/connection-config.server.ts";
const McpGuidePage = typeof guideModule === "function" ? guideModule : guideModule.default;
function configureBackend(t) {
  const original = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "http://backend.invalid:4700";
  t.after(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });
}
test("docs and both client configurations follow backend discovery at request time", async (t) => {
  configureBackend(t);
  let resource;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://backend.invalid:4700/.well-known/oauth-protected-resource/api/mcp");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ resource });
  });
  for (resource of [
    "https://staging.example.invalid/api/mcp",
    "https://app.example.invalid/api/mcp",
  ]) {
    const html = renderToStaticMarkup(await McpGuidePage());
    assert.equal(html.split(resource).length - 1, 3);
    assert.ok(html.includes("mcpServers"));
    assert.ok(html.includes("servers"));
    assert.ok(!html.includes("mokara.my"));
    assert.ok(!html.includes("localhost"));
  }
});
test("absent backend configuration never inherits a local or production URL", async (t) => {
  configureBackend(t);
  delete process.env.BACKEND_URL;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw Error("unexpected fetch");
  });
  const html = renderToStaticMarkup(await McpGuidePage());
  assert.ok(html.includes("Connection details are temporarily unavailable"));
  assert.equal(fetch.mock.callCount(), 0);
  assert.ok(!html.includes("mokara.my"));
  assert.ok(!html.includes("localhost"));
  assert.ok(!html.includes("&quot;url&quot;"));
});
test("invalid metadata and backend failures return unavailable instead of invented endpoints", async (t) => {
  configureBackend(t);
  let body;
  t.mock.method(globalThis, "fetch", async () => {
    if (body instanceof Error) throw body;
    return Response.json(body);
  });
  for (body of [
    null,
    {},
    { resource: "javascript:alert(1)" },
    { resource: "https://user:password@host.invalid/api/mcp" },
    { resource: "https://host.invalid/wrong" },
    new Error("private upstream data"),
  ])
    assert.equal(await getMcpConnectionUrl(), null);
});
