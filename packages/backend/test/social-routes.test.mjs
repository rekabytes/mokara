import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
const env = {
  ENV: "development",
  AUTH_PUBLIC_URL: "http://localhost:4701",
  GOOGLE_AUTH_CLIENT_ID: "google-client",
  GOOGLE_AUTH_CLIENT_SECRET: "secret",
  GITHUB_AUTH_CLIENT_ID: "github-client",
  GITHUB_AUTH_CLIENT_SECRET: "secret",
  AUTH_SECRET: "local-test-secret",
  AUTH_PROXY_SECRET: "",
};
const data = new Map();
let redisDown = false,
  blocked = false,
  verification = "ok",
  identity = null,
  currentIdentity = null;
let writes = [],
  exchangeCalls = 0,
  transactionCalls = 0;
const profile = {
  provider: "github",
  subject: "provider-123",
  email: "same@example.com",
  name: "Person",
};
const redis = {
  set: async (key, value) => {
    if (redisDown) throw Error("offline");
    if (data.has(key)) return null;
    data.set(key, value);
    return "OK";
  },
  get: async (key) => {
    if (redisDown) throw Error("offline");
    return data.get(key) ?? null;
  },
  getdel: async (key) => {
    const value = await redis.get(key);
    data.delete(key);
    return value;
  },
  exists: async (key) => Number(data.has(key)),
  del: async (key) => data.delete(key),
  eval: async (_script, _count, key, owner) => {
    if (data.get(key) === owner) data.delete(key);
    return 1;
  },
};
const user = { id: "new-user", username: "alice", passwordHash: null };
const prisma = {
  authIdentity: {
    findUnique: async ({ where }) => (where.provider_subject ? identity : currentIdentity),
    findMany: async () => [],
    create: async ({ data }) => {
      writes.push(data);
      return data;
    },
  },
  $transaction: async (fn) => {
    transactionCalls++;
    return fn({
      user: {
        create: async ({ data }) => {
          writes.push(data);
          return user;
        },
      },
      team: {
        create: async ({ data }) => {
          writes.push(data);
          return { id: "personal" };
        },
      },
      teamMember: {
        create: async ({ data }) => {
          writes.push(data);
          return data;
        },
      },
    });
  },
};
mock.module("../src/env.ts", { namedExports: { env, isProd: false } });
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
mock.module("../src/lib/jwt.ts", {
  namedExports: {
    COOKIE_NAME: "mokara_token",
    TOKEN_LIFETIME_S: 604800,
    issueToken: async (id) => `issued-${id}`,
    parseToken: async (token) =>
      token === "session"
        ? { sub: "owner", jti: "original-session" }
        : token === "changed"
          ? { sub: "owner", jti: "changed-session" }
          : null,
  },
});
mock.module("../src/lib/sessions.ts", {
  namedExports: { isSessionValid: async () => !blocked, trackSession: async () => {} },
});
mock.module("../src/middleware/auth-rate-limit.ts", {
  namedExports: {
    authRateLimit: () => async (c, next) =>
      redisDown ? c.json({ error: "auth_protection_unavailable" }, 503) : next(),
  },
});
mock.module("../src/lib/auth-protection.ts", {
  namedExports: { verifySignupChallenge: async () => verification },
});
mock.module("../src/lib/types.ts", {
  namedExports: {
    toMe: (u) => ({
      id: u.id,
      username: u.username,
      password_login_enabled: Boolean(u.passwordHash),
    }),
  },
});
const social = await import("../src/lib/social-auth.ts");
mock.module("../src/lib/social-auth.ts", {
  namedExports: {
    ...social,
    exchangeSocialIdentity: async () => {
      exchangeCalls++;
      return profile;
    },
  },
});
const { socialAuthRoutes } = await import("../src/routes/social-auth.ts");
const app = new Hono().route("/auth", socialAuthRoutes);
const request = (path, body, cookie, origin = "http://localhost:4701") =>
  app.request(`http://backend/auth/social${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
async function flowCookie(intent = "login", session = "session") {
  const response = await request(
    "/github/start",
    { intent, from: "/teams" },
    intent === "link" ? `mokara_token=${session}` : undefined
  );
  assert.equal(response.status, 200);
  const state = new URL((await response.json()).url).searchParams.get("state");
  return { state, cookie: response.headers.getSetCookie()[0].split(";")[0] };
}
const callback = (flow, session) =>
  app.request(`http://backend/auth/social/github/callback?state=${flow.state}&code=code`, {
    headers: { cookie: `${flow.cookie}${session ? `; mokara_token=${session}` : ""}` },
  });
beforeEach(() => {
  data.clear();
  redisDown = blocked = false;
  verification = "ok";
  identity = currentIdentity = null;
  writes = [];
  exchangeCalls = transactionCalls = 0;
});
test("start rejects cross-origin requests and anonymous linking", async () => {
  assert.equal(
    (await request("/github/start", { intent: "login" }, undefined, "https://evil.example")).status,
    403
  );
  assert.equal((await request("/github/start", { intent: "link" })).status, 401);
  assert.equal(data.size, 0);
});
test("callback cannot exchange with wrong browser, replay or changed/revoked linking session", async () => {
  let flow = await flowCookie();
  await callback({ ...flow, cookie: "mokara_social_github=wrong" });
  assert.equal(exchangeCalls, 0);
  assert.match((await callback(flow)).headers.get("location"), /social_expired/);
  flow = await flowCookie("link");
  assert.match((await callback(flow, "changed")).headers.get("location"), /social_session_changed/);
  flow = await flowCookie("link");
  blocked = true;
  assert.match((await callback(flow, "session")).headers.get("location"), /social_session_changed/);
  assert.equal(exchangeCalls, 0);
  assert.equal(writes.length, 0);
});
test("Settings linking preserves session and refuses identities owned by another account", async () => {
  let flow = await flowCookie("link");
  identity = { userId: "someone-else" };
  assert.match((await callback(flow, "session")).headers.get("location"), /social_identity_in_use/);
  assert.equal(writes.length, 0);
  identity = null;
  flow = await flowCookie("link");
  const result = await callback(flow, "session");
  assert.equal(result.headers.get("location"), "/settings?auth_connected=1");
  assert.equal(writes[0].userId, "owner");
  assert.equal(
    result.headers.getSetCookie().some((cookie) => cookie.startsWith("mokara_token=")),
    false
  );
});
test("returning identity signs in; unknown provider identity does not merge by email", async () => {
  let flow = await flowCookie();
  identity = { user: { id: "existing", username: "existing" } };
  let result = await callback(flow);
  assert.equal(result.headers.get("location"), "/teams");
  assert.ok(
    result.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("mokara_token=issued-existing"))
  );
  identity = null;
  flow = await flowCookie();
  result = await callback(flow);
  assert.equal(result.headers.get("location"), "/signup/social");
  assert.equal(writes.length, 0);
  assert.equal(transactionCalls, 0);
  assert.ok(
    result.headers.getSetCookie().some((cookie) => cookie.startsWith("mokara_social_pending="))
  );
});
async function pendingCookie() {
  const result = await callback(await flowCookie());
  return result.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("mokara_social_pending="))
    .split(";")[0];
}
test("completion requires pending state, same origin and successful challenge before transaction", async () => {
  assert.equal((await request("/complete", { username: "alice" })).status, 400);
  const cookie = await pendingCookie();
  assert.equal(
    (await request("/complete", { username: "alice" }, cookie, "https://evil.example")).status,
    403
  );
  verification = "invalid";
  assert.equal((await request("/complete", { username: "alice" }, cookie)).status, 400);
  verification = "unavailable";
  assert.equal((await request("/complete", { username: "alice" }, cookie)).status, 503);
  assert.equal(transactionCalls, 0);
});
test("completion atomically creates social-only account/workspace and rejects replay", async () => {
  const cookie = await pendingCookie();
  const result = await request("/complete", { username: "alice", display_name: "Alice" }, cookie);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).user.password_login_enabled, false);
  assert.equal(transactionCalls, 1);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].passwordHash, null);
  assert.equal(writes[0].authIdentities.create.subject, profile.subject);
  assert.equal(writes[1].ownerId, user.id);
  assert.equal(writes[2].role, "owner");
  assert.equal((await request("/complete", { username: "alice" }, cookie)).status, 400);
  assert.equal(transactionCalls, 1);
});
test("infrastructure outage fails closed without writes", async () => {
  redisDown = true;
  assert.equal((await request("/github/start", { intent: "login" })).status, 503);
  assert.equal(writes.length, 0);
});
