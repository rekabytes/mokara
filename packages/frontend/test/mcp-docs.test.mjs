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
    const skillUrl = new URL("/skills/mokara/SKILL.md", resource).href;
    assert.ok(
      html.includes(
        `npx skills@latest add &#x27;${skillUrl}&#x27; --skill mokara --agent universal --yes`
      )
    );
    assert.ok(html.includes(".agents/skills/mokara/SKILL.md"));
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
  assert.ok(!html.includes("npx skills@latest add"));
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

test("public tool catalog covers all permissions and the complete current tool inventory", async (t) => {
  configureBackend(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ resource: "https://staging.example.invalid/api/mcp" })
  );
  const html = renderToStaticMarkup(await McpGuidePage());
  const catalog = html.slice(
    html.indexOf('<h2 id="access">'),
    html.indexOf('<section aria-labelledby="writes">')
  );
  const names = [...catalog.matchAll(/<td><code>([a-z_]+)<\/code><\/td>/g)].map(
    (match) => match[1]
  );
  assert.equal(names.length, 47);
  assert.equal(new Set(names).size, 47);
  for (const name of [
    "list_drive_items",
    "search_drive_items",
    "get_drive_file",
    "read_drive_file",
    "create_drive_folder",
    "upload_drive_file",
    "create_task",
    "get_task_details",
    "upload_attachment",
    "delete_attachment",
    "get_kpi_progress",
    "publish_github_issue",
    "link_github_issue",
    "list_operations",
  ])
    assert.ok(names.includes(name), name);
  for (const scope of ["mokara:read", "mokara:write", "mokara:delete", "mokara:github"])
    assert.ok(catalog.includes(scope), scope);
  assert.ok(catalog.includes("confirm: true"));
  assert.ok(catalog.includes("request_id"));
});
