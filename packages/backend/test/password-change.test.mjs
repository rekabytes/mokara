import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { SignJWT } from "jose";

const SECRET = "test-only-password-change-secret-at-least-32-characters";
const USER = "password-user";
let state;
const values = new Map();
const counters = new Map();
const warnings = [];
const redis = {
  exists: async (key) => {
    if (state.sessionDown) throw new Error("private session detail");
    return values.has(key) ? 1 : 0;
  },
  get: async (key) => values.get(key) ?? null,
  set: async (key, value) => {
    if (state.revokeDown && key.endsWith(":minIat")) throw new Error("private revocation detail");
    values.set(key, value);
  },
  del: async (key) => values.delete(key),
  sadd: async () => 1,
  eval: async (_script, _keys, key, seconds) => {
    state.limitCalls++;
    if (state.limitDown) throw new Error("private Redis endpoint and credentials");
    if (state.badCounter) return ["bad", -1];
    let bucket = counters.get(key);
    if (!bucket || bucket.expires <= state.now) {
      bucket = { count: 0, expires: state.now + seconds };
      counters.set(key, bucket);
    }
    bucket.count++;
    return [bucket.count, bucket.expires - state.now];
  },
};
await mock.module("../src/env.ts", {
  namedExports: {
    env: { AUTH_SECRET: SECRET, AUTH_PROXY_SECRET: "", ENV: "production" },
    isProd: true,
  },
});
await mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
await mock.module("../src/db.ts", {
  namedExports: {
    prisma: {
      user: {
        findUnique: async ({ where }) => {
          state.reads++;
          return state.userMissing
            ? null
            : { id: where.id, username: "alice", passwordHash: state.socialOnly ? null : "hash" };
        },
        update: async ({ where, data }) => {
          state.updates.push({ where, data });
          state.floorAtUpdate = values.get(`mokara:user:${where.id}:minIat`);
        },
      },
    },
  },
});
await mock.module("../src/lib/password.ts", {
  namedExports: {
    verifyPassword: async (password, hash) => {
      state.checks.push({ password, hash });
      return state.passwordOk;
    },
    hashPassword: async (password) => {
      state.hashes.push(password);
      return "new-hash";
    },
  },
});
await mock.module("../src/lib/team-membership.ts", {
  namedExports: { getTeamRole: async () => null },
});
await mock.module("../src/lib/logger.ts", {
  namedExports: { log: { warn: (message) => warnings.push(message) } },
});
const { authRoutes } = await import("../src/routes/auth.ts");
const { issueToken, parseToken } = await import("../src/lib/jwt.ts");
const { isSessionValid } = await import("../src/lib/sessions.ts");
const { AUTH_LIMITS } = await import("../src/lib/auth-protection.ts");
function makeApp() {
  const app = new Hono().route("/auth", authRoutes);
  app.onError((_error, c) =>
    c.json({ error: "internal_error", message: "Something went wrong." }, 500)
  );
  return app;
}
const app = makeApp();
const body = { current_password: "wrong-password", new_password: "new-password123" };
function request(token, payload = body, target = app, extraHeaders = {}) {
  return target.request("/auth/password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `__Host-mokara_token=${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
}
function assertNoChange() {
  assert.equal(state.hashes.length, 0);
  assert.equal(state.updates.length, 0);
  assert.equal(values.has(`mokara:user:${USER}:minIat`), false);
}
beforeEach(() => {
  state = {
    now: 0,
    reads: 0,
    limitCalls: 0,
    checks: [],
    hashes: [],
    updates: [],
    passwordOk: false,
  };
  values.clear();
  counters.clear();
  warnings.length = 0;
});

test("ten guesses across devices and IPs share one account allowance before password work", async () => {
  for (let i = 0; i < 10; i++) {
    const token = await issueToken(USER, `handle${i}`);
    const response = await request(token, body, app, { "x-forwarded-for": `198.51.100.${i}` });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "incorrect_password");
  }
  state.now = 117;
  const response = await request(await issueToken(USER, "newhandle"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "483");
  assert.deepEqual(await response.json(), {
    error: "auth_rate_limited",
    message: "Too many password change attempts. Try again in 9 minutes.",
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.reads, 10);
  assert.equal(state.checks.length, 10);
  const digest = createHmac("sha256", SECRET).update(USER).digest("hex");
  assert.deepEqual([...counters.keys()], [`mokara:auth-limit:passwordChange:${digest}`]);
  assertNoChange();
});

test("concurrent requests across replicas admit only ten password checks", async () => {
  const token = await issueToken(USER, "alice");
  const otherApp = makeApp();
  const responses = await Promise.all(
    Array.from({ length: 24 }, (_, i) => request(token, body, i % 2 ? otherApp : app))
  );
  assert.equal(responses.filter((r) => r.status === 401).length, 10);
  assert.equal(responses.filter((r) => r.status === 429).length, 14);
  assert.equal(state.checks.length, 10);
  assertNoChange();
});

test("blocked attempts do not extend cooldown and window expiry permits retry", async () => {
  const token = await issueToken(USER, "alice");
  for (let i = 0; i < 10; i++) await request(token);
  state.now = 599;
  const blocked = await request(token);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "1");
  assert.match((await blocked.json()).message, /in 1 minute\./);
  state.now = 600;
  assert.equal((await request(token)).status, 401);
  assert.equal(state.checks.length, 11);
});

test("a second account and normal login keep independent allowances", async () => {
  const token = await issueToken(USER, "alice");
  for (let i = 0; i < 11; i++) await request(token);
  assert.equal((await request(await issueToken("second-user", "bob"))).status, 401);
  const login = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "wrong-password" }),
  });
  assert.equal(login.status, 401);
  assert.equal((await login.json()).error, "invalid_credentials");
  assert.equal(state.checks.length, 12);
});

test("unauthenticated, invalid and revoked sessions cannot consume the allowance", async () => {
  assert.equal((await request(null)).status, 401);
  assert.equal((await request("invalid-token")).status, 401);
  const token = await issueToken(USER, "alice");
  const claims = await parseToken(token);
  assert.ok(claims);
  values.set(`mokara:revoked:${claims.jti}`, "1");
  assert.equal((await request(token)).status, 401);
  assert.equal(state.limitCalls, 0);
  assert.equal(state.reads, 0);
  assertNoChange();
});

test("invalid input cannot trigger password work or consume the allowance", async () => {
  const token = await issueToken(USER, "alice");
  for (const payload of [{}, { ...body, current_password: "" }, { ...body, extra: true }]) {
    assert.equal((await request(token, payload)).status, 400);
  }
  assert.equal(state.limitCalls, 0);
  assert.equal(state.reads, 0);
  assertNoChange();
});

for (const failure of ["limitDown", "badCounter"]) {
  test(`${failure}: counter failure returns safe 503 without password work or session replacement`, async () => {
    state[failure] = true;
    const response = await request(await issueToken(USER, "alice"));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "auth_protection_unavailable",
      message: "Password change protection is temporarily unavailable. Please try again.",
    });
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(state.reads, 0);
    assert.equal(state.checks.length, 0);
    assertNoChange();
    assert.deepEqual(warnings, ["password change protection unavailable — failing closed"]);
  });
}

test("session-check outages reject before the counter and preserve the cookie", async () => {
  state.sessionDown = true;
  const response = await request(await issueToken(USER, "alice"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "service_unavailable");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.limitCalls, 0);
  assertNoChange();
});

test("social-only accounts retain their safe error and cannot perform password work", async () => {
  state.socialOnly = true;
  const token = await issueToken(USER, "alice");
  for (let i = 0; i < AUTH_LIMITS.passwordChange.attempts; i++) {
    const response = await request(token);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "password_login_disabled");
  }
  assert.equal((await request(token)).status, 429);
  assert.equal(state.checks.length, 0);
  assertNoChange();
});

test("successful change preserves revocation-before-update and secure replacement session", async () => {
  state.passwordOk = true;
  const now = Math.floor(Date.now() / 1000);
  const oldToken = await new SignJWT({ username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setJti("old-session")
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
  const response = await request(oldToken, { ...body, current_password: "correct-password" });
  assert.equal(response.status, 204);
  assert.deepEqual(state.checks, [{ password: "correct-password", hash: "hash" }]);
  assert.deepEqual(state.hashes, [body.new_password]);
  assert.deepEqual(state.updates, [{ where: { id: USER }, data: { passwordHash: "new-hash" } }]);
  assert.ok(state.floorAtUpdate);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const token = cookie.match(/^__Host-mokara_token=([^;]+)/)?.[1];
  assert.ok(token);
  const claims = await parseToken(token);
  assert.ok(claims);
  assert.notEqual(claims.jti, "old-session");
  assert.equal(claims.sub, USER);
  assert.equal(await isSessionValid(redis, claims), true);
  assert.equal(
    await isSessionValid(redis, { sub: USER, jti: "old-session", iat: now - 60 }),
    false
  );
});

test("successful changes and replacement tokens do not reset the allowance", async () => {
  state.passwordOk = true;
  let token = await issueToken(USER, "alice");
  for (let i = 0; i < 10; i++) {
    const response = await request(token);
    assert.equal(response.status, 204);
    token = response.headers.get("set-cookie").match(/^__Host-mokara_token=([^;]+)/)?.[1];
    assert.ok(token);
  }
  const blocked = await request(token);
  assert.equal(blocked.status, 429);
  assert.equal(state.hashes.length, 10);
  assert.equal(state.updates.length, 10);
});

test("revocation failure cannot change the password or issue a replacement cookie", async () => {
  state.passwordOk = true;
  state.revokeDown = true;
  const response = await request(await issueToken(USER, "alice"));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.updates.length, 0);
  assert.deepEqual(await response.json(), {
    error: "internal_error",
    message: "Something went wrong.",
  });
});

test("oversized replacement passwords are rejected before password work and revocation", async () => {
  state.passwordOk = true;
  const response = await request(await issueToken(USER, "alice"), {
    ...body,
    new_password: "😀".repeat(19),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_input");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.limitCalls, 0);
  assert.equal(state.reads, 0);
  assert.equal(state.checks.length, 0);
  assertNoChange();
});

test("legacy current passwords are passed intact to verification when setting a valid replacement", async () => {
  state.passwordOk = true;
  const current = "a".repeat(72) + "legacy-tail";
  const response = await request(await issueToken(USER, "alice"), {
    ...body,
    current_password: current,
  });
  assert.equal(response.status, 204);
  assert.deepEqual(state.checks, [{ password: current, hash: "hash" }]);
  assert.equal(state.updates.length, 1);
});
