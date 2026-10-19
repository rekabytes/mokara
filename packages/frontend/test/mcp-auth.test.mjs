import { test } from "node:test";
import assert from "node:assert/strict";
import { authReturnPath } from "../lib/auth-return-path.ts";
import { GET as discovery } from "../app/.well-known/[...path]/route.ts";
import { api } from "../lib/api.ts";
import { renderToStaticMarkup } from "react-dom/server";
import * as permissionModule from "../components/McpPermissions.tsx";
const { McpPermissions } = permissionModule.default ?? permissionModule;
test("GitHub consent explains future active repositories without a separate repository picker", () => {
  const render = (scopes) => renderToStaticMarkup(McpPermissions({ scopes, onScopesChange() {} }));
  const html = render(["mokara:read", "mokara:github"]);
  assert.ok(html.includes("Follows your active repositories"));
  assert.ok(html.includes("activate later"));
  assert.ok(html.includes("without reconnecting"));
  assert.ok(!html.includes("Approved GitHub repositories"));
  assert.ok(!render(["mokara:read"]).includes("Follows your active repositories"));
});
test("sign-in resumes exact consent route and rejects external/API/traversal targets", () => {
  const flow = "/mcp/authorize?request=abc";
  assert.equal(authReturnPath(flow), flow);
  for (const value of [
    "//evil.example",
    "/\\evil.example",
    "/api/mcp",
    "/tasks/../../api/auth",
    "/tasks/%2e%2e/api/auth",
    "/mcp/authorize/other",
    "https://evil.example",
  ])
    assert.equal(authReturnPath(value), "/tasks");
});
test("discovery proxy forwards only allow-listed paths without client secrets or cookies", async (t) => {
  const original = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "http://backend.invalid:4700";
  t.after(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ resource: "https://mokara.example/api/mcp" });
  });
  const signal = new AbortController().signal;
  const request = {
    nextUrl: new URL(
      "https://mokara.example/.well-known/oauth-protected-resource/api/mcp?secret=private"
    ),
    headers: new Headers({ Cookie: "private-session", Authorization: "private-token" }),
    signal,
  };
  const response = await discovery(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    calls[0].url,
    "http://backend.invalid:4700/.well-known/oauth-protected-resource/api/mcp"
  );
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(
    (
      await discovery({
        ...request,
        nextUrl: new URL("https://mokara.example/.well-known/../../api/me"),
      })
    ).status,
    404
  );
  assert.equal(calls.length, 1);
});
test("consent navigation rejects non-HTTP and non-loopback insecure callbacks", async (t) => {
  let url;
  t.mock.method(globalThis, "fetch", async () => Response.json({ url }));
  for (url of [
    "javascript:alert(1)",
    "http://agent.example/callback",
    "https://u:p@agent.example/callback",
    "https://agent.example/\\evil",
  ])
    await assert.rejects(
      () => api.approveMcp({ request: "r", approve: false, workspace_ids: [] }),
      (error) => error.error === "invalid_response"
    );
});
