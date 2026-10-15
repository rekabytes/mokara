import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Hono } from "hono";
import { SignJWT } from "jose";

const USER = "stream-user";
const SECRET = "test-only-stream-secret-at-least-32-characters";
let state;
const values = new Map();
const subscribers = [];
const warnings = [];

class Subscriber extends EventEmitter {
  channels = [];
  disconnected = false;
  async connect() {
    if (state.connectFails) throw new Error("private connection detail");
  }
  async subscribe(...channels) {
    this.channels = channels;
    if (state.subscribeGate) await state.subscribeGate;
    if (state.subscribeFails) throw new Error("private subscription detail");
  }
  disconnect() {
    this.disconnected = true;
  }
}
const redis = {
  duplicate: () => {
    const sub = new Subscriber();
    subscribers.push(sub);
    return sub;
  },
  exists: async (key) => {
    if (state.redisDown) throw new Error("private Redis detail");
    return values.has(key) ? 1 : 0;
  },
  get: async (key) => {
    if (state.redisDown) throw new Error("private Redis detail");
    return values.get(key) ?? null;
  },
  set: async (key, value) => values.set(key, value),
  del: async (key) => values.delete(key),
  sadd: async () => 1,
  srem: async () => 1,
};

await mock.module("../src/env.ts", {
  namedExports: { env: { AUTH_SECRET: SECRET, ENV: "development" }, isProd: false },
});
await mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
await mock.module("../src/db.ts", {
  namedExports: {
    prisma: {
      user: {
        findUnique: async ({ where }) => {
          assert.equal(where.id, USER);
          state.reads++;
          if (state.readGate && (!state.pauseOnRead || state.reads === state.pauseOnRead))
            await state.readGate;
          if (state.dbDown) throw new Error("private database detail");
          return state.userExists
            ? { memberships: state.teams.map((teamId) => ({ teamId })) }
            : null;
        },
      },
    },
  },
});
await mock.module("../src/lib/logger.ts", {
  namedExports: { log: { warn: (message) => warnings.push(message) } },
});

const { authRequired } = await import("../src/middleware/auth.ts");
const { mountEventsRoute } = await import("../src/routes/events.ts");
const { issueToken, parseToken } = await import("../src/lib/jwt.ts");
const { revokeToken, revokeAllSessions } = await import("../src/lib/sessions.ts");

beforeEach(() => {
  state = { teams: ["alpha", "beta"], userExists: true, reads: 0 };
  values.clear();
  subscribers.length = 0;
  warnings.length = 0;
});

function app() {
  const app = new Hono();
  app.onError((_error, c) =>
    c.json({ error: "internal_error", message: "internal server error" }, 500)
  );
  app.use("*", authRequired);
  mountEventsRoute(app);
  return app;
}

async function open(t, token) {
  token ??= await issueToken(USER, "alice");
  const controller = new AbortController();
  const response = await app().request("/events", {
    headers: { cookie: `mokara_token=${token}` },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const reader = response.body.getReader();
  t.after(async () => {
    controller.abort();
    await reader.cancel();
  });
  const initial = await reader.read();
  assert.match(new TextDecoder().decode(initial.value), /event: ping/);
  return { reader, controller, claims: await parseToken(token), sub: subscribers.at(-1) };
}

const message = (sub, team = "alpha", data = "private content") =>
  sub.emit("message", `mokara:team:${team}`, JSON.stringify({ event: "task.updated", data }));

async function assertClosed(connection) {
  assert.deepEqual(await connection.reader.read(), { done: true, value: undefined });
  assert.equal(connection.sub.disconnected, true);
  assert.equal(connection.sub.listenerCount("message"), 0);
  assert.equal(connection.sub.listenerCount("close"), 0);
}

test("valid members receive workspace and personal events in order, ignoring unknown channels", async (t) => {
  const connection = await open(t);
  assert.deepEqual(connection.sub.channels, [
    "mokara:user:stream-user",
    "mokara:team:alpha",
    "mokara:team:beta",
  ]);
  message(connection.sub, "unrelated");
  message(connection.sub, "alpha", "first");
  connection.sub.emit(
    "message",
    "mokara:user:stream-user",
    JSON.stringify({ event: "notification", data: "second" })
  );
  assert.match(
    new TextDecoder().decode((await connection.reader.read()).value),
    /event: task.updated\ndata: .*first/
  );
  assert.match(
    new TextDecoder().decode((await connection.reader.read()).value),
    /event: notification\ndata: .*second/
  );
});

test("leaving/removal or workspace deletion blocks the next frame, reconnect excludes it", async (t) => {
  const connection = await open(t);
  state.teams = ["beta"];
  message(connection.sub);
  await assertClosed(connection);
  const reconnected = await open(t);
  assert.deepEqual(reconnected.sub.channels, ["mokara:user:stream-user", "mokara:team:beta"]);
  message(reconnected.sub, "beta", "still authorized");
  assert.match(
    new TextDecoder().decode((await reconnected.reader.read()).value),
    /still authorized/
  );
});

test("queued frames recheck access after an earlier frame finishes", async (t) => {
  const connection = await open(t);
  let release;
  state.pauseOnRead = state.reads + 2;
  state.readGate = new Promise((resolve) => {
    release = resolve;
  });
  message(connection.sub, "alpha", "before removal");
  message(connection.sub, "alpha", "must not arrive");
  // Pause the second authorization read while the first frame is delivered.
  await nextTurn();
  state.teams = ["beta"];
  release();
  const first = await connection.reader.read();
  assert.match(new TextDecoder().decode(first.value), /before removal/);
  await assertClosed(connection);
});

test("logout/per-device revocation prevents the next live update and reconnection", async (t) => {
  const connection = await open(t);
  await revokeToken(redis, connection.claims);
  message(connection.sub);
  await assertClosed(connection);
  const token = await new SignJWT({ username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setJti(connection.claims.jti)
    .setIssuedAt(connection.claims.iat)
    .setExpirationTime(connection.claims.exp)
    .sign(new TextEncoder().encode(SECRET));
  const response = await app().request("/events", { headers: { cookie: `mokara_token=${token}` } });
  assert.equal(response.status, 401);
});

test("sign-out-everywhere/password-change floor also invalidates open streams", async (t) => {
  const connection = await open(t);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 2000 });
  await revokeAllSessions(redis, USER);
  message(connection.sub);
  await assertClosed(connection);
});

test("idle heartbeat detects removal without sending protected events", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const connection = await open(t);
  state.teams = [];
  t.mock.timers.tick(25_000);
  await assertClosed(connection);
  const reads = state.reads;
  t.mock.timers.tick(50_000);
  await nextTurn();
  assert.equal(state.reads, reads, "cleanup cancels heartbeat checks");
});

test("idle heartbeat detects revocation; a healthy heartbeat keeps the connection usable", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const connection = await open(t);
  t.mock.timers.tick(25_000);
  assert.match(new TextDecoder().decode((await connection.reader.read()).value), /event: ping/);
  await revokeToken(redis, connection.claims);
  t.mock.timers.tick(25_000);
  await assertClosed(connection);
});

test("token expiry closes an idle connection at its deadline", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: Math.floor(Date.now() / 1000) * 1000,
  });
  const token = await new SignJWT({ username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setJti("short-session")
    .setIssuedAt()
    .setExpirationTime("2s")
    .sign(new TextEncoder().encode(SECRET));
  const connection = await open(t, token);
  t.mock.timers.tick(2000);
  await assertClosed(connection);
});

test("tokens missing an expiry cannot open an unbounded stream", async () => {
  const token = await new SignJWT({ username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setJti("no-expiry")
    .setIssuedAt()
    .sign(new TextEncoder().encode(SECRET));
  const response = await app().request("/events", { headers: { cookie: `mokara_token=${token}` } });
  assert.equal(response.status, 401);
  assert.equal(subscribers.length, 0);
});

test("account deletion stops personal notifications as well as workspace frames", async (t) => {
  const connection = await open(t);
  state.userExists = false;
  connection.sub.emit("message", "mokara:user:stream-user", "private content");
  await assertClosed(connection);
});

test("Redis/DB validation failures close safely without sending private errors", async (t) => {
  for (const failure of ["redisDown", "dbDown"]) {
    state[failure] = false;
    const connection = await open(t);
    state[failure] = true;
    message(connection.sub);
    await assertClosed(connection);
    state[failure] = false;
  }
  assert.ok(warnings.length >= 2);
  assert.equal(
    warnings.some((line) => /private|stream-user/.test(line)),
    false
  );
});

test("subscriber errors and disconnects close the stream rather than resume unchecked", async (t) => {
  for (const event of ["error", "close"]) {
    const connection = await open(t);
    connection.sub.emit(event, new Error("private subscriber detail"));
    await assertClosed(connection);
  }
});

test("abort during an authorization check never writes the pending event", async (t) => {
  const connection = await open(t);
  let release;
  state.readGate = new Promise((resolve) => {
    release = resolve;
  });
  message(connection.sub);
  await nextTurn();
  connection.controller.abort();
  release();
  await assertClosed(connection);
});

test("expiry during an authorization check prevents its pending frame", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: Math.floor(Date.now() / 1000) * 1000,
  });
  const token = await new SignJWT({ username: "alice" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setJti("expires-during-read")
    .setIssuedAt()
    .setExpirationTime("2s")
    .sign(new TextEncoder().encode(SECRET));
  const connection = await open(t, token);
  let release;
  state.readGate = new Promise((resolve) => {
    release = resolve;
  });
  message(connection.sub);
  await nextTurn();
  t.mock.timers.tick(2000);
  release();
  await assertClosed(connection);
});

test("client cancellation releases subscriptions and heartbeat resources", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const connection = await open(t);
  await connection.reader.cancel();
  await nextTurn();
  assert.equal(connection.sub.disconnected, true);
  assert.equal(connection.sub.listenerCount("message"), 0);
  const reads = state.reads;
  t.mock.timers.tick(50_000);
  await nextTurn();
  assert.equal(state.reads, reads);
});

test("overloaded readers close with bounded queued work", async (t) => {
  const connection = await open(t);
  for (let index = 0; index < 33; index++) message(connection.sub);
  await assertClosed(connection);
});

test("revocation during subscription setup is checked before the first frame", async () => {
  let release;
  state.subscribeGate = new Promise((resolve) => {
    release = resolve;
  });
  const token = await issueToken(USER, "alice");
  const responsePromise = app().request("/events", {
    headers: { cookie: `mokara_token=${token}` },
  });
  await nextTurn();
  await revokeToken(redis, await parseToken(token));
  release();
  const response = await responsePromise;
  assert.deepEqual(await response.body.getReader().read(), { done: true, value: undefined });
  assert.equal(subscribers[0].disconnected, true);
});

test("subscription setup failures release the Redis connection and use the API error boundary", async () => {
  for (const failure of ["connectFails", "subscribeFails"]) {
    state[failure] = true;
    const token = await issueToken(USER, "alice");
    const response = await app().request("/events", {
      headers: { cookie: `mokara_token=${token}` },
    });
    assert.equal(response.status, 500);
    assert.equal(subscribers.at(-1).disconnected, true);
    assert.equal((await response.text()).includes("private"), false);
    state[failure] = false;
  }
});
