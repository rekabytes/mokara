import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { spawnSync } from "node:child_process";
import { Hono } from "hono";
import { validBrowserOriginList, originlessMachinePath } from "../src/lib/browser-origin.ts";
const PUBLIC = "https://app.test.invalid";
const OTHER = "https://other.test.invalid";
const env = { AUTH_PUBLIC_URL: PUBLIC, CORS_ALLOWED_ORIGINS: "", MCP_ALLOWED_ORIGINS: "" };
await mock.module("../src/env.ts", { namedExports: { env } });
const { corsMiddleware } = await import("../src/middleware/cors.ts");
let hits;
const app = new Hono().use("*", corsMiddleware).all("*", (c) => {
  hits++;
  // Machine exemptions must still reach their own authentication boundary.
  if (originlessMachinePath(c.req.path))
    return c.json({ error: "unauthorized", message: "Credentials required." }, 401);
  return c.json({ ok: true });
});
beforeEach(() => {
  Object.assign(env, {
    AUTH_PUBLIC_URL: PUBLIC,
    CORS_ALLOWED_ORIGINS: "",
    MCP_ALLOWED_ORIGINS: "",
  });
  hits = 0;
});
function request(path = "/api/tasks", method = "POST", headers = {}) {
  return app.request(path, { method, headers });
}
test("canonical frontend is trusted behind the same-origin proxy without a CORS override", async () => {
  const response = await request("http://internal.test.invalid:4700/api/tasks", "POST", {
    Origin: PUBLIC,
    Cookie: "mokara_token=test",
  });
  assert.equal(response.status, 200);
  assert.equal(hits, 1);
  assert.equal(response.headers.get("access-control-allow-origin"), PUBLIC);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-expose-headers"), /X-Mokara-Next-Cursor/);
  assert.match(response.headers.get("vary"), /Origin/);
});
test("untrusted simple form posts are rejected before handlers, with or without cookies", async () => {
  for (const cookie of [undefined, "mokara_token=test"]) {
    const response = await request("/api/auth/login", "POST", {
      Origin: OTHER,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "origin_forbidden");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
  assert.equal(hits, 0);
});
test("all write methods require an explicit trusted origin", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(
      (await request("/api/teams/team/files", method, { Cookie: "mokara_token=test" })).status,
      403
    );
    assert.equal((await request("/api/teams/team/files", method, { Origin: PUBLIC })).status, 200);
  }
  assert.equal(hits, 4);
});
test("null, malformed, lookalike and multi-origin headers never grant access", async () => {
  for (const origin of [
    "null",
    `${PUBLIC}/`,
    `${PUBLIC}/path`,
    `${PUBLIC}.evil.invalid`,
    `${PUBLIC}, ${OTHER}`,
    "*",
    "https://user:secret@app.test.invalid",
  ]) {
    assert.equal((await request("/api/me", "GET", { Origin: origin })).status, 403);
  }
  assert.equal(hits, 0);
});
test("empty and wildcard configuration cannot reflect arbitrary credentialed origins", async () => {
  for (const raw of ["", "*", `*,${OTHER}`]) {
    env.AUTH_PUBLIC_URL = "";
    env.CORS_ALLOWED_ORIGINS = raw;
    // Explicit OTHER remains trusted when included; wildcard itself never grants anything.
    assert.equal((await request("/api/me", "GET", { Origin: PUBLIC })).status, 403);
  }
  assert.equal(hits, 0);
});
test("extra exact origins are allowed while canonical frontend stays trusted", async () => {
  env.CORS_ALLOWED_ORIGINS = ` ${OTHER}/ `;
  for (const origin of [PUBLIC, OTHER]) {
    const response = await request("/api/tasks", "POST", { Origin: origin });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
});
test("preflight is answered only for trusted browser origins and does not run handlers", async () => {
  const allowed = await request("/api/tasks", "OPTIONS", {
    Origin: PUBLIC,
    "Access-Control-Request-Method": "PATCH",
  });
  assert.equal(allowed.status, 204);
  assert.match(allowed.headers.get("access-control-allow-methods"), /PATCH/);
  assert.equal((await request("/api/tasks", "OPTIONS", { Origin: OTHER })).status, 403);
  assert.equal(hits, 0);
});
test("originless reads and provider callback navigations work without credentialed CORS", async () => {
  for (const path of [
    "/api/me",
    "/api/events",
    "/api/auth/social/google/callback",
    "/api/integrations/github/callback",
    "/health",
  ]) {
    const response = await request(path, "GET", { Cookie: "mokara_token=test" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});
test("Host and forwarded headers cannot turn an untrusted site into a trusted one", async () => {
  assert.equal(
    (
      await request(`${OTHER}/api/tasks`, "POST", {
        Origin: OTHER,
        Host: "app.test.invalid",
        "X-Forwarded-Host": "app.test.invalid",
        "X-Forwarded-Proto": "https",
      })
    ).status,
    403
  );
  assert.equal(
    (await request(`${PUBLIC}/api/tasks`, "POST", { "Sec-Fetch-Site": "same-origin" })).status,
    403
  );
  assert.equal(hits, 0);
});
test("native signed webhooks and admin proxy still reach their own authentication", async () => {
  for (const path of [
    "/api/billing/webhook",
    "/api/integrations/github/webhook",
    "/api/admin/login",
    "/api/admin/users",
  ]) {
    assert.equal((await request(path)).status, 401);
  }
  assert.equal(hits, 4);
  for (const path of [
    "/api/admin-evil",
    "/api/billing/webhook/extra",
    "/api/integrations/github/webhook-evil",
  ]) {
    assert.equal((await request(path)).status, 403);
  }
  assert.equal(hits, 4);
});
test("native MCP and browser MCP retain their independent policy", async () => {
  assert.equal((await request("/api/mcp")).status, 200);
  assert.equal((await request("/api/mcp", "POST", { Origin: PUBLIC })).status, 403);
  env.MCP_ALLOWED_ORIGINS = OTHER;
  const response = await request("/api/mcp", "POST", { Origin: OTHER });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});
test("OAuth discovery and machine token endpoints keep credentialless cross-origin access", async () => {
  for (const [path, method] of [
    ["/.well-known/oauth-authorization-server", "GET"],
    ["/api/mcp/oauth/register", "POST"],
    ["/api/mcp/oauth/token", "POST"],
    ["/api/mcp/oauth/revoke", "POST"],
  ]) {
    const response = await request(path, method, { Origin: OTHER });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
  assert.equal((await request("/api/mcp/oauth/consent", "POST", { Origin: OTHER })).status, 403);
});
test("configuration rejects wildcards, URL paths, credentials and opaque origins", () => {
  for (const raw of [
    "*",
    "null",
    "file://local",
    `${PUBLIC}/path`,
    `${PUBLIC}?q=x`,
    "https://user:secret@app.test.invalid",
    `*,${PUBLIC}`,
  ])
    assert.equal(validBrowserOriginList(raw), false);
  assert.equal(validBrowserOriginList(""), true);
  assert.equal(validBrowserOriginList(`${PUBLIC}, ${OTHER}/`), true);
});
test("actual environment validation rejects open CORS configuration without reading local secrets", () => {
  for (const cors of ["*", `${PUBLIC}/path`, PUBLIC, ""]) {
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", "await import('./src/env.ts')"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 10000,
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: "postgresql://test:test@invalid/test",
          ENV: "development",
          CORS_ALLOWED_ORIGINS: cors,
          DOTENV_CONFIG_PATH: "/nonexistent-mokara-test-env",
        },
      }
    );
    assert.equal(child.status === 0, cors === PUBLIC || cors === "", child.stderr);
  }
});
