import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

const settings = {
  ADMIN_USERNAME: "test-operator",
  ADMIN_PASSWORD: "test-only-operator-password",
  ADMIN_URL_KEY: "test-only-private-access-key",
  ADMIN_TOKEN_SECRET: "test-only-admin-signing-secret-at-least-32-characters",
};
const credentials = {
  username: settings.ADMIN_USERNAME,
  password: settings.ADMIN_PASSWORD,
  url_key: settings.ADMIN_URL_KEY,
};
let now;
let unavailable;
let malformedCounter;
const buckets = new Map();
const keys = [];
const warnings = [];
const redis = {
  eval: async (_script, _keyCount, key, seconds) => {
    if (unavailable) throw new Error("private Redis detail");
    if (malformedCounter) return null;
    keys.push(key);
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + seconds };
      buckets.set(key, bucket);
    }
    bucket.count++;
    return [bucket.count, bucket.expires - now];
  },
};
const backendEnvMock = await mock.module("../src/env.ts", {
  namedExports: { env: settings, adminConfigured: true },
});
await mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
await mock.module("../src/lib/logger.ts", {
  namedExports: { log: { warn: (message) => warnings.push(message) } },
});
const consoleEnvMock = await mock.module("../../admin/src/env.ts", {
  namedExports: {
    env: { ...settings, BACKEND_URL: "http://backend.invalid:4700" },
    adminConfigured: true,
    isProd: true,
    COOKIE_NAME: "__Host-mokara_admin_token",
    ADMIN_TOKEN_TTL_S: 28800,
  },
});

const { adminLoginRoutes } = await import("../src/routes/admin-login.ts");
const { verifyAdminToken } = await import("../src/lib/admin-token.ts");
const { AUTH_LIMITS } = await import("../src/lib/auth-protection.ts");
const { mountAdminLoginRoutes } = await import("../../admin/src/routes/login.ts");
const { securityHeaders } = await import("../../admin/src/lib/security.ts");

beforeEach(() => {
  now = 0;
  unavailable = false;
  malformedCounter = false;
  buckets.clear();
  keys.length = 0;
  warnings.length = 0;
});
function backendApp() {
  return new Hono().route("/api/admin", adminLoginRoutes);
}
function consoleApp() {
  const app = new Hono();
  app.use("*", securityHeaders);
  mountAdminLoginRoutes(app);
  return app;
}
function login(data = credentials, app = backendApp(), headers = {}) {
  return app.request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
}
function consoleLogin(data = credentials) {
  return consoleApp().request("/login", { method: "POST", body: new URLSearchParams(data) });
}

test("normal operator sign-in issues a valid token within the shared budget", async () => {
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await verifyAdminToken((await response.json()).token)).sub, "admin");
  assert.equal(keys.length, 1);
  assert.equal(keys[0].includes(settings.ADMIN_USERNAME), false);
  assert.equal(keys[0].includes(settings.ADMIN_URL_KEY), false);
});

test("changing submitted usernames or forwarded IP headers cannot reset the operator limit", async () => {
  for (let index = 0; index < AUTH_LIMITS.adminLogin.attempts; index++) {
    const result = await login(
      { ...credentials, username: `guess-${index}`, password: "incorrect" },
      backendApp(),
      { "x-forwarded-for": `198.51.100.${index}`, "cf-connecting-ip": `198.51.100.${index}` }
    );
    assert.equal(result.status, 401);
  }
  const blocked = await login();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "600");
  const body = await blocked.json();
  assert.equal(body.error, "auth_rate_limited");
  assert.equal("token" in body, false);
  assert.equal(new Set(keys).size, 1);
});

test("concurrent requests through separate backend apps share the same atomic allowance", async () => {
  const replicas = [backendApp(), backendApp()];
  const responses = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      login({ ...credentials, password: "incorrect" }, replicas[index % replicas.length])
    )
  );
  assert.equal(responses.filter((response) => response.status === 401).length, 10);
  assert.equal(responses.filter((response) => response.status === 429).length, 5);
  assert.equal(buckets.size, 1);
});

test("blocked retries do not extend the cooldown and valid login recovers after expiry", async () => {
  for (let index = 0; index < 10; index++) await login({ ...credentials, password: "incorrect" });
  now = 120;
  assert.equal((await login()).headers.get("retry-after"), "480");
  now = 599;
  assert.equal((await login()).headers.get("retry-after"), "1");
  now = 600;
  assert.equal((await login()).status, 200);
});

test("successful attempts also count rather than resetting the window", async () => {
  for (let index = 0; index < 10; index++) assert.equal((await login()).status, 200);
  assert.equal((await login()).status, 429);
});

test("requests without the correct access key cannot consume the operator budget", async () => {
  for (let index = 0; index < 15; index++) {
    const response = await login({ ...credentials, url_key: `incorrect-${index}` });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid_credentials");
  }
  assert.equal(keys.length, 0);
  assert.equal((await login()).status, 200);
});

test("Redis outages and invalid counter results fail closed without issuing tokens or leaking details", async () => {
  for (const failure of ["outage", "invalid counter"]) {
    unavailable = failure === "outage";
    malformedCounter = failure === "invalid counter";
    const response = await login();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, "auth_protection_unavailable");
    assert.equal("token" in body, false);
    assert.equal(JSON.stringify(body).includes("private"), false);
  }
  assert.equal(warnings.length, 2);
  assert.equal(JSON.stringify(warnings).includes(settings.ADMIN_PASSWORD), false);
});

test("invalid credentials retain a generic response and malformed input does not enter the limiter", async () => {
  const first = await login({ ...credentials, username: "incorrect" });
  const second = await login({ ...credentials, password: "incorrect" });
  assert.deepEqual(await first.json(), await second.json());
  const before = keys.length;
  assert.equal((await login({ ...credentials, password: "x".repeat(201) })).status, 400);
  assert.equal(keys.length, before);
  assert.equal((await login({ ...credentials, extra: true })).status, 400);
});

test("oversized login bodies are rejected before credential checking or Redis access", async () => {
  const response = await login({ ...credentials, password: "x".repeat(5000) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "payload_too_large");
  assert.equal(keys.length, 0);
});

test("console displays the real cooldown and preserves 429 without setting a session", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "auth_rate_limited", message: "private upstream detail" },
      { status: 429, headers: { "retry-after": "121" } }
    )
  );
  const response = await consoleLogin();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "121");
  assert.equal(response.headers.has("set-cookie"), false);
  const html = await response.text();
  assert.match(html, /Try again in 3 minutes/);
  assert.equal(html.includes("private upstream detail"), false);
  assert.match(html, /role="alert"/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("console handles malformed/missing Retry-After safely without inventing a cooldown", async (t) => {
  for (const value of [null, "-1", "0", "1.5", "invalid", "999999999999999999999"]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        { error: "auth_rate_limited" },
        { status: 429, headers: value === null ? {} : { "retry-after": value } }
      )
    );
    const response = await consoleLogin();
    assert.equal(response.status, 429);
    assert.equal(response.headers.has("retry-after"), false);
    assert.match(await response.text(), /Please try again later/);
  }
});

test("console keeps unavailable protection as 503 and never creates a session", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "auth_protection_unavailable", message: "private detail" },
      { status: 503 }
    )
  );
  const response = await consoleLogin();
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  const html = await response.text();
  assert.match(html, /Sign-in is temporarily unavailable/);
  assert.equal(html.includes("private detail"), false);
});

test("console's valid sign-in still verifies its backend token and sets a secure cookie", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) =>
    backendApp().request(new Request(url, init))
  );
  const response = await consoleLogin();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/overview");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /__Host-mokara_admin_token=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test("incorrect console access keys remain hidden and never reach the backend", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call backend");
  });
  assert.equal((await consoleLogin({ ...credentials, url_key: "incorrect" })).status, 404);
  assert.equal((await consoleApp().request("/login?key=incorrect")).status, 404);
  assert.equal(fetch.mock.callCount(), 0);
});

test("console bounds posted form bodies before forwarding credentials", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call backend");
  });
  assert.equal((await consoleLogin({ ...credentials, password: "x".repeat(5000) })).status, 413);
  assert.equal(fetch.mock.callCount(), 0);
});

test("disabled backend and console logins stay hidden without invoking the limiter or upstream", async (t) => {
  backendEnvMock.restore();
  t.mock.module("../src/env.ts", { namedExports: { env: settings, adminConfigured: false } });
  const { adminLoginRoutes: disabled } = await import("../src/routes/admin-login.ts?disabled");
  const response = await login(credentials, new Hono().route("/api/admin", disabled));
  assert.equal(response.status, 404);
  assert.equal(keys.length, 0);
  consoleEnvMock.restore();
  t.mock.module("../../admin/src/env.ts", {
    namedExports: {
      env: settings,
      adminConfigured: false,
      isProd: true,
      COOKIE_NAME: "__Host-mokara_admin_token",
      ADMIN_TOKEN_TTL_S: 28800,
    },
  });
  const { mountAdminLoginRoutes: mountDisabled } =
    await import("../../admin/src/routes/login.ts?disabled");
  const app = new Hono();
  mountDisabled(app);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Must not call upstream");
  });
  assert.equal((await app.request("/login?key=" + settings.ADMIN_URL_KEY)).status, 404);
  assert.equal(
    (await app.request("/login", { method: "POST", body: new URLSearchParams(credentials) }))
      .status,
    404
  );
  assert.equal(fetch.mock.callCount(), 0);
});
