import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Hono } from "hono";
const origin = "https://mokara.example",
  resource = `${origin}/api/mcp`;
const userId = randomUUID(),
  workspaceId = randomUUID();
let clients, grants, codes, tokens, cache, member, redisDown, databaseDown, quota;
const logs = [],
  hash = (raw) => createHash("sha256").update(raw).digest("hex");
const active = (row) => row && !row.revokedAt && row.expiresAt > new Date();
const db = {
  mcpOAuthClient: {
    create: async ({ data }) => {
      const row = { ...data, id: randomUUID(), createdAt: new Date() };
      clients.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }) => clients.get(where.id) ?? null,
  },
  mcpConnection: {
    create: async ({ data }) => {
      const row = {
        ...data,
        id: randomUUID(),
        tokenHash: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      grants.set(row.id, row);
      return row;
    },
    findFirst: async ({ where }) => {
      const row = grants.get(where.id);
      return active(row) &&
        row.userId === where.userId &&
        row.clientId === where.clientId &&
        row.resource === where.resource
        ? row
        : null;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const row of grants.values())
        if (
          (!where.id || row.id === where.id) &&
          (!where.clientId || row.clientId === where.clientId)
        ) {
          Object.assign(row, data);
          count++;
        }
      return { count };
    },
  },
  mcpOAuthCode: {
    create: async ({ data }) => {
      codes.set(data.codeHash, { ...data, consumedAt: null });
      return data;
    },
    findUnique: async ({ where }) => {
      const row = codes.get(where.codeHash);
      return row ? { ...row, connection: grants.get(row.connectionId) } : null;
    },
    updateMany: async ({ where, data }) => {
      const row = codes.get(where.codeHash);
      if (!row || row.consumedAt || row.expiresAt <= new Date()) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  mcpOAuthToken: {
    create: async ({ data }) => {
      if (databaseDown) throw Error("private DB contents");
      const row = { ...data, id: randomUUID(), refreshUsedAt: null };
      tokens.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const row = [...tokens.values()].find((row) =>
        where.accessHash
          ? row.accessHash === where.accessHash
          : row.refreshHash === where.refreshHash
      );
      return row ? { ...row, connection: grants.get(row.connectionId) } : null;
    },
    updateMany: async ({ where, data }) => {
      const row = [...tokens.values()].find((row) => row.refreshHash === where.refreshHash);
      if (!row || row.refreshUsedAt) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    findFirst: async ({ where }) =>
      [...tokens.values()].find(
        (row) =>
          (row.accessHash === where.OR[0].accessHash ||
            row.refreshHash === where.OR[1].refreshHash) &&
          grants.get(row.connectionId)?.clientId === where.connection.clientId
      ) ?? null,
  },
  teamMember: {
    findMany: async ({ where }) =>
      member
        ? where.teamId
          ? where.teamId.in.filter((id) => id === workspaceId).map((teamId) => ({ teamId }))
          : [{ team: { id: workspaceId, name: "My workspace" } }]
        : [],
  },
};
// Serialize conditional row writes; roll back infrastructure failures.
let queue = Promise.resolve();
db.$transaction = (fn) => {
  const result = queue.then(async () => {
    const backup = structuredClone({ grants, codes, tokens });
    try {
      return await fn(db);
    } catch (error) {
      ({ grants, codes, tokens } = backup);
      throw error;
    }
  });
  queue = result.catch(() => {});
  return result;
};
mock.module("../src/db.ts", { namedExports: { prisma: db } });
mock.module("../src/env.ts", {
  namedExports: {
    env: {
      ENV: "production",
      AUTH_PUBLIC_URL: origin,
      AUTH_SECRET: "test-secret",
      MCP_ALLOWED_ORIGINS: "",
      AUTH_PROXY_SECRET: "",
      CORS_ALLOWED_ORIGINS: origin,
    },
  },
});
mock.module("../src/redis.ts", {
  namedExports: {
    getRedis: () => ({
      set: async (key, value) => {
        if (redisDown) throw Error("private redis");
        cache.set(key, value);
      },
      get: async (key) => {
        if (redisDown) throw Error("private redis");
        return cache.get(key) ?? null;
      },
      eval: async (_script, _num, key, value) => {
        if (redisDown) throw Error("private redis");
        if (key.startsWith("mcp:consent:")) {
          if (cache.get(key) !== value) return 0;
          cache.delete(key);
          return 1;
        }
        return [quota, 60];
      },
    }),
  },
});
mock.module("../src/lib/logger.ts", {
  namedExports: { log: { error: (...args) => logs.push(args) } },
});
mock.module("../src/middleware/auth.ts", {
  namedExports: {
    authRequired: async (c, next) => {
      if (!c.req.header("cookie")?.includes("session=valid"))
        return c.json({ error: "not_authenticated", message: "login required" }, 401);
      c.set("userId", userId);
      await next();
    },
  },
});
const { mcpOAuthRoutes } = await import("../src/mcp/oauth-routes.ts");
const { mcpOAuthMetadata } = await import("../src/mcp/oauth-metadata.ts");
const { authenticateAgent } = await import("../src/mcp/access.ts");
const { handleMcpHttpError } = await import("../src/mcp/errors.ts");
const { isSafeOAuthRedirect } = await import("../src/mcp/oauth-config.ts");
const { corsMiddleware } = await import("../src/middleware/cors.ts");
const app = new Hono();
app.use("*", corsMiddleware);
app.route("/api/mcp/oauth", mcpOAuthRoutes);
app.route("/.well-known", mcpOAuthMetadata);
const authApp = new Hono();
authApp.onError(handleMcpHttpError);
authApp.get("/", async (c) => c.json(await authenticateAgent(c.req.header("Authorization"))));
beforeEach(() => {
  clients = new Map();
  grants = new Map();
  codes = new Map();
  tokens = new Map();
  cache = new Map();
  member = true;
  redisDown = false;
  databaseDown = false;
  quota = 1;
  logs.length = 0;
});
async function register(overrides = {}) {
  return app.request("/api/mcp/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test agent",
      redirect_uris: ["http://127.0.0.1:5030/callback?existing=yes"],
      ...overrides,
    }),
  });
}
async function start(overrides = {}) {
  const client = await (await register()).json(),
    verifier = "v".repeat(43);
  const params = {
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: client.redirect_uris[0],
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource,
    scope: "mokara:read",
    state: "agent-state",
    ...overrides,
  };
  const response = await app.request(`/api/mcp/oauth/authorize?${new URLSearchParams(params)}`);
  const request = response.headers.get("location")
    ? new URL(response.headers.get("location")).searchParams.get("request")
    : null;
  return {
    client,
    params,
    verifier,
    response,
    request,
    cookie: `${response.headers.get("set-cookie")?.split(";")[0]}; session=valid`,
  };
}
async function consent(flow, overrides = {}, headers = {}) {
  return app.request("/api/mcp/oauth/consent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: flow.cookie,
      ...headers,
    },
    body: JSON.stringify({
      request: flow.request,
      approve: true,
      workspace_ids: [workspaceId],
      ...overrides,
    }),
  });
}
async function approved() {
  const flow = await start();
  const response = await consent(flow);
  assert.equal(response.status, 200, await response.clone().text());
  const callback = new URL((await response.json()).url);
  assert.equal(callback.searchParams.get("state"), "agent-state");
  assert.equal(callback.searchParams.get("existing"), "yes");
  return { ...flow, code: callback.searchParams.get("code") };
}
async function exchange(flow, overrides = {}) {
  return app.request("/api/mcp/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: flow.client.client_id,
      code: flow.code,
      redirect_uri: flow.params.redirect_uri,
      code_verifier: flow.verifier,
      resource,
      ...overrides,
    }),
  });
}
const refresh = (flow, raw) =>
  app.request("/api/mcp/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: flow.client.client_id,
      resource,
      refresh_token: raw,
    }),
  });

test("discovery advertises public PKCE clients and unauthorized requests supply resource metadata", async () => {
  const as = await (await app.request("/.well-known/oauth-authorization-server")).json();
  assert.equal(as.issuer, origin);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ["none"]);
  const metadata = await app.request("/.well-known/oauth-protected-resource/api/mcp");
  assert.equal((await metadata.json()).resource, resource);
  assert.equal(metadata.headers.get("access-control-allow-origin"), "*");
  const response = await authApp.request("/");
  assert.equal(response.status, 401);
  assert.ok(
    response.headers
      .get("www-authenticate")
      .includes(`${origin}/.well-known/oauth-protected-resource/api/mcp`)
  );
});
test("registration rejects unsafe redirects, secrets and unsupported grants", async () => {
  for (const uri of [
    "https://a.example/#",
    "https://u:p@a.example/cb",
    "https://a.example/\\evil",
    "http://a.example/cb",
    "javascript:alert(1)",
  ]) {
    assert.equal(isSafeOAuthRedirect(uri), false);
    assert.equal((await register({ redirect_uris: [uri] })).status, 400);
  }
  assert.equal((await register({ grant_types: ["password"] })).status, 400);
  assert.equal((await register({ token_endpoint_auth_method: "client_secret_post" })).status, 400);
  assert.equal((await register({ redirect_uris: ["https://agent.example/callback"] })).status, 201);
});
test("standard advisory registration metadata never triggers remote fetching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("unexpected remote request");
  });
  const response = await register({
    client_uri: "https://agent.example",
    logo_uri: "https://agent.example/logo.png",
    software_version: "1.0",
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).logo_uri, undefined);
  assert.equal((await register({ grant_types: [] })).status, 400);
});

test("authorize requires exact registered redirect, resource, code flow and S256", async () => {
  for (const overrides of [
    { resource: "https://other.example/api/mcp" },
    { redirect_uri: "https://attacker.example/cb" },
    { code_challenge_method: "plain" },
    { response_type: "token" },
    { code_challenge: "" },
  ])
    assert.equal((await start(overrides)).response.status, 400);
  const flow = await start();
  assert.equal(flow.response.status, 302);
  assert.match(flow.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(flow.response.headers.get("set-cookie"), /Secure/);
  assert.equal(
    (
      await app.request(
        `/api/mcp/oauth/authorize?${new URLSearchParams(flow.params)}&client_id=${flow.client.client_id}`
      )
    ).status,
    400
  );
  assert.equal(grants.size, 0);
});
test("consent requires session, browser binding, same origin and explicit membership; deny consumes request", async () => {
  const flow = await start();
  assert.equal((await app.request(`/api/mcp/oauth/consent?request=${flow.request}`)).status, 401);
  assert.equal((await consent(flow, {}, { Cookie: "session=valid" })).status, 400);
  assert.equal((await consent(flow, {}, { Origin: "https://evil.example" })).status, 400);
  assert.equal((await consent(flow, { workspace_ids: [] })).status, 400);
  assert.equal((await consent(flow, { workspace_ids: [randomUUID()] })).status, 400);
  member = false;
  assert.equal((await consent(flow)).status, 400);
  member = true;
  const snapshot = await app.request(`/api/mcp/oauth/consent?request=${flow.request}`, {
    headers: { Cookie: flow.cookie },
  });
  assert.equal((await snapshot.json()).workspaces[0].id, workspaceId);
  assert.equal(grants.size, 0);
  const denied = new URL((await (await consent(flow, { approve: false })).json()).url);
  assert.equal(denied.searchParams.get("error"), "access_denied");
  assert.equal(denied.searchParams.get("state"), "agent-state");
  assert.equal(grants.size, 0);
  assert.equal((await consent(flow)).status, 400);
});
test("token exchange stores only hashes and bearer access stays bound to grant and resource", async () => {
  const flow = await approved();
  assert.equal((await consent(flow)).status, 400);
  const response = await exchange(flow);
  assert.equal(response.status, 200, await response.clone().text());
  const token = await response.json();
  assert.match(token.access_token, /^mk_oat_/);
  assert.match(token.refresh_token, /^mk_ort_/);
  assert.equal(token.scope, "mokara:read");
  assert.ok(token.expires_in > 0 && token.expires_in <= 900);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const serialized = JSON.stringify([...tokens.values(), ...codes.values(), ...grants.values()]);
  for (const secret of [flow.code, token.access_token, token.refresh_token])
    assert.ok(!serialized.includes(secret));
  const principal = await authenticateAgent(`Bearer ${token.access_token}`);
  assert.equal(principal.userId, userId);
  assert.deepEqual(principal.workspaceIds, [workspaceId]);
  const row = [...tokens.values()][0];
  row.accessExpiresAt = new Date(0);
  await assert.rejects(() => authenticateAgent(`Bearer ${token.access_token}`));
  row.accessExpiresAt = new Date(Date.now() + 10000);
  [...grants.values()][0].resource = "https://other.example/api/mcp";
  await assert.rejects(() => authenticateAgent(`Bearer ${token.access_token}`));
});
test("resource rejection preserves code; PKCE, redirect and client substitution cannot issue tokens", async () => {
  const flow = await approved();
  assert.equal((await exchange(flow, { resource: "https://other.example/api/mcp" })).status, 400);
  assert.equal([...codes.values()][0].consumedAt, null);
  const other = await (await register()).json();
  assert.equal((await exchange(flow, { client_id: other.client_id })).status, 400);
  assert.equal(tokens.size, 0);
  assert.equal((await exchange(flow, { code_verifier: "w".repeat(43) })).status, 400);
  assert.equal(tokens.size, 0);
  assert.ok([...codes.values()][0].consumedAt);
  const second = await approved();
  assert.equal(
    (await exchange(second, { redirect_uri: "https://agent.example/wrong" })).status,
    400
  );
  assert.equal(tokens.size, 0);
});
test("authorization code replay revokes issued credentials", async () => {
  const flow = await approved();
  const token = await (await exchange(flow)).json();
  [...codes.values()][0].expiresAt = new Date(0);
  assert.equal((await exchange(flow)).status, 400);
  await assert.rejects(() => authenticateAgent(`Bearer ${token.access_token}`));
});
test("refresh rotates once, caps lifetime and revokes the family on replay", async () => {
  const flow = await approved();
  const token = await (await exchange(flow)).json();
  const grant = [...grants.values()][0];
  grant.expiresAt = new Date(Date.now() + 100000);
  const rotatedResponse = await refresh(flow, token.refresh_token);
  assert.equal(rotatedResponse.status, 200, await rotatedResponse.clone().text());
  const rotated = await rotatedResponse.json();
  assert.notEqual(rotated.refresh_token, token.refresh_token);
  assert.notEqual(rotated.access_token, token.access_token);
  assert.ok(
    [...tokens.values()].every(
      (row) =>
        row.refreshExpiresAt <= grant.expiresAt || row.refreshHash === hash(token.refresh_token)
    )
  );
  assert.equal((await refresh(flow, token.refresh_token)).status, 400);
  await assert.rejects(() => authenticateAgent(`Bearer ${rotated.access_token}`));
  assert.equal((await refresh(flow, rotated.refresh_token)).status, 400);
});
test("competing refreshes issue at most once and replay revokes returned tokens", async () => {
  const flow = await approved();
  const token = await (await exchange(flow)).json();
  const results = await Promise.all([
    refresh(flow, token.refresh_token),
    refresh(flow, token.refresh_token),
  ]);
  assert.deepEqual(results.map((row) => row.status).sort(), [200, 400]);
  assert.ok([...grants.values()][0].revokedAt);
});
test("revocation is client-bound, idempotent and prevents refresh", async () => {
  const flow = await approved();
  const token = await (await exchange(flow)).json();
  const other = await (await register()).json();
  const revoke = (client_id, raw) =>
    app.request("/api/mcp/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id, token: raw }),
    });
  assert.equal((await revoke(other.client_id, token.refresh_token)).status, 200);
  await authenticateAgent(`Bearer ${token.access_token}`);
  assert.equal((await revoke(flow.client.client_id, "unknown")).status, 200);
  assert.equal((await revoke(flow.client.client_id, token.access_token)).status, 200);
  assert.equal((await refresh(flow, token.refresh_token)).status, 400);
});
test("infrastructure failures roll back consumption; quotas and outages fail closed with safe errors", async () => {
  const flow = await approved();
  databaseDown = true;
  const response = await exchange(flow);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private"));
  assert.equal([...codes.values()][0].consumedAt, null);
  databaseDown = false;
  assert.equal((await exchange(flow)).status, 200);
  quota = 2000;
  const limited = await register();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  quota = 1;
  redisDown = true;
  assert.equal((await register()).status, 503);
  assert.ok(!JSON.stringify(logs).includes("private"));
});
test("duplicate form fields, unsupported grants and oversized bodies fail before issuance", async () => {
  const flow = await approved();
  assert.equal((await exchange(flow, { grant_type: "password" })).status, 400);
  assert.equal(
    (
      await app.request("/api/mcp/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `resource=${encodeURIComponent(resource)}&resource=other`,
      })
    ).status,
    400
  );
  assert.equal(
    (await app.request("/api/mcp/oauth/register", { method: "POST", body: "x".repeat(16385) }))
      .status,
    400
  );
  assert.equal(tokens.size, 0);
});

test("expired consent, authorization codes, grants and refresh tokens deny issuance", async () => {
  const expiredFlow = await start();
  cache.clear();
  assert.equal((await consent(expiredFlow)).status, 400);
  const flow = await approved();
  [...codes.values()][0].expiresAt = new Date(0);
  assert.equal((await exchange(flow)).status, 400);
  assert.equal(tokens.size, 0);
  const next = await approved();
  const response = await exchange(next);
  assert.equal(response.status, 200);
  const token = await response.json();
  [...tokens.values()][0].refreshExpiresAt = new Date(0);
  assert.equal((await refresh(next, token.refresh_token)).status, 400);
  const grant = [...grants.values()].find((row) => row.id === [...tokens.values()][0].connectionId);
  grant.expiresAt = new Date(0);
  await assert.rejects(() => authenticateAgent(`Bearer ${token.access_token}`));
});
