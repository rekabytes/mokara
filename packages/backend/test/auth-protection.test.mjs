import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  authClientIp,
  ipBucket,
  normalizeIp,
  consumeAuthLimit,
  signupProtection,
  verifySignupChallenge,
} from "../src/lib/auth-protection.ts";
import { setAuthProxyHeaders } from "../../frontend/app/api/[...path]/auth-proxy.server.ts";

const secret = "test-only-proxy-secret-at-least-32-characters";
const settings = {
  ENV: "production",
  DEPLOY_MODE: "hosted",
  TURNSTILE_SITE_KEY: "public-test-site",
  TURNSTILE_SECRET_KEY: "private-test-secret",
  TURNSTILE_HOSTNAMES: "mokara.example, staging.example",
};

test("hosted production requires complete protection; self-hosted/dev opt in only", () => {
  const empty = {
    ...settings,
    TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    TURNSTILE_HOSTNAMES: "",
  };
  assert.equal(signupProtection(empty).required, true);
  assert.equal(signupProtection(empty).configured, false);
  assert.equal(
    signupProtection({ ...settings, TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" })
      .configured,
    false
  );
  assert.equal(
    signupProtection({ ...settings, TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }).configured,
    false
  );
  assert.equal(signupProtection({ ...empty, ENV: "development" }).required, false);
  assert.equal(signupProtection({ ...empty, DEPLOY_MODE: "self_hosted" }).required, false);
  assert.equal(
    signupProtection({ ...empty, ENV: "development", TURNSTILE_SITE_KEY: "partial" }).required,
    true
  );
});

test("verification checks provider success, action and hostname", async () => {
  const check = (reply) =>
    verifySignupChallenge("token", settings, async (url, init) => {
      assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      assert.deepEqual(JSON.parse(init.body), {
        secret: settings.TURNSTILE_SECRET_KEY,
        response: "token",
      });
      assert.ok(init.signal);
      return Response.json(reply);
    });
  assert.equal(await check({ success: true, action: "signup", hostname: "mokara.example" }), "ok");
  assert.equal(
    await check({ success: true, action: "signup", hostname: "evil.example" }),
    "invalid"
  );
  assert.equal(
    await check({ success: true, action: "login", hostname: "mokara.example" }),
    "invalid"
  );
  assert.equal(await check({ success: true }), "invalid");
  assert.equal(await check({ success: false, "error-codes": ["timeout-or-duplicate"] }), "invalid");
  assert.equal(
    await check({ success: false, "error-codes": ["invalid-input-secret"] }),
    "unavailable"
  );
  assert.equal(await check({ wrong: true }), "unavailable");
});

test("missing tokens/configuration skip provider calls and outages fail closed", async () => {
  let calls = 0;
  const fail = async () => {
    calls++;
    throw new Error("provider timeout");
  };
  assert.equal(await verifySignupChallenge(undefined, settings, fail), "invalid");
  assert.equal(await verifySignupChallenge("x".repeat(2049), settings, fail), "invalid");
  assert.equal(
    await verifySignupChallenge("token", { ...settings, TURNSTILE_SECRET_KEY: "" }, fail),
    "unavailable"
  );
  assert.equal(calls, 0);
  assert.equal(await verifySignupChallenge("token", settings, fail), "unavailable");
  assert.equal(
    await verifySignupChallenge(
      "token",
      settings,
      async () => new Response("oops", { status: 503 })
    ),
    "unavailable"
  );
  assert.equal(
    await verifySignupChallenge("token", settings, async () => new Response("not-json")),
    "unavailable"
  );
});

test("forwarded browser headers alone cannot select an IP", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.9",
    "cf-connecting-ip": "198.51.100.9",
    "x-mokara-client-ip": "198.51.100.9",
  });
  assert.equal(authClientIp(headers, "::ffff:192.0.2.1", secret), "192.0.2.1");
});

test("frontend signatures work end to end and tampering/expiry falls back", () => {
  const now = 1_800_000_000_000;
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.9",
    "x-mokara-client-signature": "spoof",
  });
  setAuthProxyHeaders(
    headers,
    { AUTH_PROXY_SECRET: secret, AUTH_CLIENT_IP_HEADER: "cf-connecting-ip" },
    now
  );
  assert.equal(authClientIp(headers, "192.0.2.1", secret, now), "198.51.100.9");
  assert.equal(authClientIp(headers, "192.0.2.1", secret, now + 60_001), "192.0.2.1");
  assert.equal(
    authClientIp(headers, "192.0.2.1", "wrong-secret-but-at-least-32-characters", now),
    "192.0.2.1"
  );
  headers.set("x-mokara-client-ip", "203.0.113.1");
  assert.equal(authClientIp(headers, "192.0.2.1", secret, now), "192.0.2.1");
});

test("frontend strips assertions when forwarding is disabled and rejects partial/untrusted configuration", () => {
  const headers = new Headers({
    "x-mokara-client-ip": "spoof",
    "x-mokara-client-time": "123",
    "x-mokara-client-signature": "spoof",
  });
  setAuthProxyHeaders(headers, {});
  assert.equal(headers.get("x-mokara-client-ip"), null);
  assert.equal(headers.get("x-mokara-client-time"), null);
  assert.equal(headers.get("x-mokara-client-signature"), null);
  assert.throws(() => setAuthProxyHeaders(headers, { AUTH_PROXY_SECRET: secret }));
  assert.throws(() =>
    setAuthProxyHeaders(headers, {
      AUTH_PROXY_SECRET: secret,
      AUTH_CLIENT_IP_HEADER: "x-forwarded-for",
    })
  );
  assert.throws(() =>
    setAuthProxyHeaders(headers, { AUTH_PROXY_SECRET: secret, AUTH_CLIENT_IP_HEADER: "x-real-ip" })
  );
  headers.set("x-real-ip", "198.51.100.1, 192.0.2.1");
  assert.throws(() =>
    setAuthProxyHeaders(headers, { AUTH_PROXY_SECRET: secret, AUTH_CLIENT_IP_HEADER: "x-real-ip" })
  );
});

test("IPv6 textual variants/privacy addresses share /64; IPv4 mapped addresses share IPv4", () => {
  assert.equal(normalizeIp("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIp("::ffff:c000:201"), "192.0.2.1");
  assert.equal(normalizeIp("not-an-ip"), null);
  assert.equal(
    ipBucket(normalizeIp("2001:db8:1:2::abcd")),
    ipBucket(normalizeIp("2001:0db8:0001:0002:ffff::1"))
  );
  assert.notEqual(
    ipBucket(normalizeIp("2001:db8:1:2::1")),
    ipBucket(normalizeIp("2001:db8:1:3::1"))
  );
});

test("counter boundaries return real TTL and do not persist literal identities", async () => {
  const keys = [];
  let count = 0;
  const redis = {
    eval: async (_script, keyCount, key, seconds) => {
      keys.push(key);
      assert.equal(keyCount, 1);
      assert.equal(seconds, 3600);
      return [++count, 123];
    },
  };
  for (let index = 0; index < 5; index++)
    assert.equal(await consumeAuthLimit(redis, "signup", "198.51.100.42", secret), 0);
  assert.equal(await consumeAuthLimit(redis, "signup", "198.51.100.42", secret), 123);
  assert.equal(new Set(keys).size, 1);
  assert.equal(keys[0].includes("198.51.100.42"), false);
  await assert.rejects(() =>
    consumeAuthLimit({ eval: async () => null }, "login", "alice", secret)
  );
});

// Isolated route tests: no sockets, real databases, Redis or Cloudflare calls.
Object.assign(process.env, {
  DATABASE_URL: "postgresql://test:test@invalid/auth_test",
  ENV: "development",
});
const routeEnv = { ...settings, AUTH_SECRET: secret, AUTH_PROXY_SECRET: secret };
let state;
const redis = {
  eval: async (_script, _keys, key, seconds) => {
    if (state.redisDown) throw new Error("private Redis address");
    const count = (state.counters.get(key) ?? 0) + 1;
    state.counters.set(key, count);
    return [count, seconds];
  },
};
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "alice",
  displayName: null,
  createdAt: new Date(),
  passwordHash: "hash",
  tourState: "pending",
  tourResolvedAt: null,
};
const db = {
  user: {
    create: async () => {
      state.creates++;
      return user;
    },
    findUnique: async () => {
      state.reads++;
      return state.userExists ? user : null;
    },
  },
  team: { findUnique: async () => null },
  $transaction: async (work) =>
    work({
      team: { create: async () => ({ id: "team" }) },
      teamMember: { create: async () => ({}) },
    }),
};
await mock.module("../src/env.ts", { namedExports: { env: routeEnv, isProd: true } });
await mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
await mock.module("../src/db.ts", { namedExports: { prisma: db } });
await mock.module("../src/lib/password.ts", {
  namedExports: {
    hashPassword: async () => {
      state.hashes++;
      return "hash";
    },
    verifyPassword: async () => {
      state.passwordChecks++;
      return state.passwordOk;
    },
  },
});
await mock.module("../src/lib/team-membership.ts", {
  namedExports: { getTeamRole: async () => null },
});
const { authRoutes } = await import("../src/routes/auth.ts");
const app = new Hono().route("/auth", authRoutes);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  state = {
    counters: new Map(),
    redisDown: false,
    creates: 0,
    reads: 0,
    hashes: 0,
    passwordChecks: 0,
    userExists: true,
    passwordOk: false,
    providerCalls: 0,
  };
  Object.assign(routeEnv, settings);
  globalThis.fetch = async () => {
    state.providerCalls++;
    return Response.json({ success: true, action: "signup", hostname: "mokara.example" });
  };
});
const request = (path, body, ip = "198.51.100.1") => {
  const headers = new Headers({ "content-type": "application/json", "x-real-ip": ip });
  setAuthProxyHeaders(headers, { AUTH_PROXY_SECRET: secret, AUTH_CLIENT_IP_HEADER: "x-real-ip" });
  return app.request(`/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
};
const signup = { username: "alice", password: "password123", turnstile_token: "token" };

test("signup creates an account/session only after valid server verification", async () => {
  const response = await request("signup", signup);
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(state.providerCalls, 1);
  assert.equal(state.hashes, 1);
  assert.equal(state.creates, 1);
});

test("missing/replayed tokens and mismatched action cannot reach hashing or DB", async () => {
  const missing = await request("signup", { username: "alice", password: "password123" });
  assert.equal(missing.status, 400);
  globalThis.fetch = async () =>
    Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
  assert.equal((await request("signup", signup)).status, 400);
  globalThis.fetch = async () =>
    Response.json({ success: true, action: "login", hostname: "mokara.example" });
  assert.equal((await request("signup", signup)).status, 400);
  assert.equal(state.hashes, 0);
  assert.equal(state.creates, 0);
});

test("sixth signup is blocked before provider/hash/database and includes Retry-After", async () => {
  for (let index = 0; index < 5; index++)
    assert.equal((await request("signup", signup)).status, 201);
  const response = await request("signup", signup);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "3600");
  assert.equal(state.providerCalls, 5);
  assert.equal(state.hashes, 5);
  assert.equal(state.creates, 5);
});

test("invalid signup inputs still consume IP quota", async () => {
  for (let index = 0; index < 5; index++) assert.equal((await request("signup", {})).status, 400);
  assert.equal((await request("signup", signup)).status, 429);
  assert.equal(state.hashes, 0);
  assert.equal(state.providerCalls, 0);
});

test("Redis/provider outages and incomplete production config fail closed", async () => {
  state.redisDown = true;
  assert.equal((await request("signup", signup)).status, 503);
  assert.equal((await request("login", signup)).status, 503);
  state.redisDown = false;
  globalThis.fetch = async () => {
    throw new Error("provider offline");
  };
  assert.equal((await request("signup", signup)).status, 503);
  routeEnv.TURNSTILE_SECRET_KEY = "";
  assert.equal((await request("signup", signup)).status, 503);
  assert.equal(state.creates, 0);
  assert.equal(state.hashes, 0);
  assert.equal(state.reads, 0);
});

test("rotating IPs cannot bypass account-wide login limit", async () => {
  for (let index = 1; index <= 10; index++)
    assert.equal((await request("login", signup, `198.51.100.${index}`)).status, 401);
  const blocked = await request("login", signup, "203.0.113.1");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "600");
  assert.equal(state.reads, 10);
  assert.equal(state.passwordChecks, 10);
});

test("rotating usernames cannot bypass IP-wide login limit", async () => {
  state.userExists = false;
  for (let index = 0; index < 60; index++)
    assert.equal((await request("login", { ...signup, username: `user${index}` })).status, 401);
  assert.equal((await request("login", { ...signup, username: "another" })).status, 429);
  assert.equal(state.reads, 60);
});

test("valid login retains session behavior; unknown user and wrong password have same public error", async () => {
  const wrong = await request("login", signup);
  state.userExists = false;
  const unknown = await request("login", signup);
  assert.deepEqual(await wrong.json(), await unknown.json());
  state.userExists = true;
  state.passwordOk = true;
  const success = await request("login", signup);
  assert.equal(success.status, 200);
  assert.match(success.headers.get("set-cookie"), /HttpOnly/i);
});

test("public config contains no secret and is never cached", async () => {
  const response = await app.request("/auth/signup-protection");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { required: true, site_key: "public-test-site" });
  routeEnv.TURNSTILE_SITE_KEY = "";
  assert.equal((await app.request("/auth/signup-protection")).status, 503);
});

test("unsigned/spoofed requests share actual-peer bucket", async () => {
  for (let index = 0; index < 6; index++) {
    const response = await app.request("/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${index}` },
      body: JSON.stringify(signup),
    });
    assert.equal(response.status, index < 5 ? 201 : 429);
  }
  assert.equal(state.creates, 5);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
