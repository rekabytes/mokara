import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const userId = randomUUID(),
  id = randomUUID(),
  repoId = randomUUID();
const env = {
  GITHUB_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
  GITHUB_APP_CLIENT_ID: "test",
  GITHUB_APP_CLIENT_SECRET: "test",
  GITHUB_CALLBACK_URL: "http://localhost/callback",
};
mock.module("../src/env.ts", { namedExports: { env, githubConfigured: true } });
let row, calls, visible, enabled, failure, gate, identity, transactionDepth, savedBeforeRead;
const db = {
  $queryRaw: async () => [],
  $transaction: async (fn) => {
    transactionDepth++;
    try {
      return await fn(db);
    } finally {
      transactionDepth--;
    }
  },
  gitHubAccountConnection: {
    findUnique: async () => (row ? structuredClone(row) : null),
    findMany: async () =>
      row?.status === "active" &&
      row.credentialsEncrypted &&
      (!row.verificationRetryAt || row.verificationRetryAt <= new Date())
        ? [{ userId }]
        : [],
    updateMany: async ({ where, data }) => {
      if (!row) return { count: 0 };
      for (const key of ["id", "userId", "status", "refreshLeaseId", "credentialsEncrypted"])
        if (where[key] !== undefined && where[key] !== row[key]) return { count: 0 };
      if (where.OR && row.refreshLeaseUntil && row.refreshLeaseUntil > new Date())
        return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  gitHubAccountInstallation: { deleteMany: async () => {}, upsert: async () => {} },
  gitHubInstallation: { upsert: async () => ({ id: "installation" }) },
  gitHubRepository: {
    upsert: async () => ({ id: repoId }),
    findMany: async () =>
      enabled && row?.status === "active"
        ? [{ id: repoId, fullName: "team/repo", private: true }]
        : [],
  },
  gitHubAccountRepository: {
    deleteMany: async ({ where }) => {
      if (where.repository?.githubRepositoryId?.notIn?.length === 0) enabled = false;
    },
    upsert: async ({ create }) => assert.equal(create.enabled, undefined),
  },
  gitHubIssueLink: { updateMany: async () => ({ count: 0 }) },
};
mock.module("../src/db.ts", { namedExports: { prisma: db } });
const { encryptGitHubCredentials: encrypt, decryptGitHubCredentials: decrypt } =
  await import("../src/lib/github-credentials.ts");
const { ensureGitHubAccess: ensure, refreshDueGitHubConnections: sweep } =
  await import("../src/lib/github-access.ts");
const { eligibleRepositories } = await import("../src/mcp/repositories.ts");
const { exchangeGitHubCode } = await import("../src/lib/github.ts");
const raw = () => ({
  accessToken: "private-access",
  refreshToken: "private-refresh",
  expiresAt: Date.now() - 1000,
  refreshExpiresAt: Date.now() + 86400000,
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  assert.equal(transactionDepth, 0, "provider I/O cannot run in database transactions");
  const path = new URL(url).pathname;
  calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
  if (gate) await gate(path);
  if (failure === "outage" || (failure === "read-outage" && path === "/user"))
    return Response.json({ message: "private upstream detail" }, { status: 503 });
  if (path === "/login/oauth/access_token") {
    if (failure === "invalid") return Response.json({ error: "bad_refresh_token" });
    if (failure === "http-invalid")
      return Response.json({ error: "bad_refresh_token" }, { status: 400 });
    if (failure === "client-config")
      return Response.json({ error: "incorrect_client_credentials" }, { status: 401 });
    if (failure === "malformed")
      return Response.json({ access_token: "new-access", expires_in: 28800 });
    return Response.json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 28800,
      refresh_token_expires_in: 15552000,
    });
  }
  if (path === "/user") {
    if (failure === "unauthorized")
      return Response.json({ message: "Bad credentials" }, { status: 401 });
    savedBeforeRead = decrypt(userId, row.credentialsEncrypted).refreshToken === "new-refresh";
    return Response.json({ id: identity, login: "owner" });
  }
  if (path === "/user/installations")
    return Response.json({
      installations: visible
        ? [{ id: 12, account: { id: 22, login: "team", type: "Organization" } }]
        : [],
    });
  if (path === "/user/installations/12/repositories")
    return Response.json({
      repositories: [
        { id: 33, name: "repo", full_name: "team/repo", private: true, owner: { login: "team" } },
      ],
    });
  throw Error("Unexpected test request " + path);
};
process.on("exit", () => {
  globalThis.fetch = originalFetch;
});
beforeEach(() => {
  calls = [];
  visible = true;
  enabled = true;
  failure = null;
  gate = null;
  identity = 11;
  transactionDepth = 0;
  savedBeforeRead = false;
  row = {
    id,
    userId,
    githubUserId: 11n,
    githubLogin: "owner",
    status: "active",
    verifiedAt: new Date(Date.now() - 2 * 86400000),
    credentialsEncrypted: encrypt(userId, raw()),
    refreshLeaseId: null,
    refreshLeaseUntil: null,
    verificationRetryAt: null,
  };
});
test("authenticated encryption hides tokens, binds to user identity and rejects tampering/wrong keys", () => {
  const value = raw(),
    cipher = encrypt(userId, value);
  assert.deepEqual(decrypt(userId, cipher), value);
  assert.ok(!cipher.includes(value.accessToken) && !cipher.includes(value.refreshToken));
  assert.throws(() => decrypt(randomUUID(), cipher), { code: "github_credentials_unavailable" });
  assert.throws(() => decrypt(userId, cipher.slice(0, -6) + "AAAAAA"), {
    code: "github_credentials_unavailable",
  });
  const old = env.GITHUB_TOKEN_ENCRYPTION_KEY;
  env.GITHUB_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 18).toString("base64");
  try {
    assert.throws(() => decrypt(userId, cipher), { code: "github_credentials_unavailable" });
  } finally {
    env.GITHUB_TOKEN_ENCRYPTION_KEY = old;
  }
});
test("expired tokens renew without reconnect and rotated credentials are saved before repository reads", async () => {
  await ensure(userId);
  assert.equal(calls[0].body.grant_type, "refresh_token");
  assert.equal(savedBeforeRead, true);
  assert.equal(row.status, "active");
  assert.equal(row.refreshLeaseId, null);
  assert.equal(enabled, true);
  assert.ok(row.verifiedAt > new Date(Date.now() - 1000));
});
test("concurrent callers share one rotation and fresh snapshots avoid redundant calls", async () => {
  await Promise.all(Array.from({ length: 20 }, () => ensure(userId)));
  const count = calls.length;
  await ensure(userId);
  assert.equal(calls.length, count);
  assert.equal(calls.filter((c) => c.path === "/login/oauth/access_token").length, 1);
});
test("another process lease blocks refresh and stays owned by that process", async () => {
  const lease = randomUUID();
  row.refreshLeaseId = lease;
  row.refreshLeaseUntil = new Date(Date.now() + 120000);
  await assert.rejects(ensure(userId), { code: "github_verification_pending" });
  assert.equal(calls.length, 0);
  assert.equal(row.refreshLeaseId, lease);
});
test("expired leases recover and are released", async () => {
  row.refreshLeaseId = randomUUID();
  row.refreshLeaseUntil = new Date(0);
  await ensure(userId);
  assert.equal(row.refreshLeaseId, null);
});
test("revoked refresh tokens require reconnect and remove stored credentials", async () => {
  failure = "invalid";
  await assert.rejects(ensure(userId), { code: "github_reauthorization_required" });
  assert.equal(row.status, "revoked");
  assert.equal(row.credentialsEncrypted, null);
});
test("outages preserve credentials and selections, fail MCP closed, and back off until retry", async () => {
  failure = "outage";
  const cipher = row.credentialsEncrypted;
  await assert.rejects(eligibleRepositories(userId), { code: "github_unavailable" });
  assert.equal(row.credentialsEncrypted, cipher);
  assert.equal(row.status, "active");
  assert.equal(enabled, true);
  const count = calls.length;
  await sweep();
  assert.equal(calls.length, count);
  await assert.rejects(ensure(userId), { code: "github_verification_pending" });
  failure = null;
  await ensure(userId, true);
  assert.equal(row.verificationRetryAt, null);
});
test("lost organization access removes MCP eligibility without revoking user identity", async () => {
  visible = false;
  assert.deepEqual(await eligibleRepositories(userId), []);
  assert.equal(enabled, false);
  assert.equal(row.status, "active");
});
test("revocation racing with provider reads cannot reactivate the connection", async () => {
  gate = async (path) => {
    if (path === "/user") {
      row.status = "revoked";
      row.refreshLeaseId = null;
      row.refreshLeaseUntil = null;
    }
  };
  await assert.rejects(ensure(userId), { code: "github_verification_pending" });
  assert.equal(row.status, "revoked");
  assert.ok(row.verifiedAt < new Date(Date.now() - 86400000));
});
test("an identity mismatch cannot inherit existing repository choices", async () => {
  identity = 999;
  await assert.rejects(ensure(userId), { code: "github_reauthorization_required" });
  assert.equal(row.credentialsEncrypted, null);
});
test("legacy expired connections require one migration reconnect without provider calls", async () => {
  row.credentialsEncrypted = null;
  await assert.rejects(ensure(userId), { code: "github_reauthorization_required" });
  assert.equal(calls.length, 0);
});
test("non-expiring tokens still get per-user permission checks without token rotation", async () => {
  row.credentialsEncrypted = encrypt(userId, {
    accessToken: "private-access",
    refreshToken: null,
    expiresAt: null,
    refreshExpiresAt: null,
  });
  await ensure(userId);
  assert.ok(calls.some((c) => c.path === "/user/installations/12/repositories"));
  assert.ok(!calls.some((c) => c.path === "/login/oauth/access_token"));
});
test("revoked access tokens require reconnect rather than a permanent outage state", async () => {
  failure = "unauthorized";
  await assert.rejects(ensure(userId), { code: "github_reauthorization_required" });
  assert.equal(row.status, "revoked");
});
test("malformed renewable credentials are rejected before persistence", async () => {
  failure = "malformed";
  await assert.rejects(exchangeGitHubCode("test-code"), { code: "github_unavailable" });
});

test("an outage after rotation keeps the new refresh token and recovery does not reuse its predecessor", async () => {
  failure = "read-outage";
  await assert.rejects(ensure(userId), { code: "github_unavailable" });
  assert.equal(decrypt(userId, row.credentialsEncrypted).refreshToken, "new-refresh");
  failure = null;
  await ensure(userId, true);
  assert.equal(calls.filter((c) => c.path === "/login/oauth/access_token").length, 1);
});
test("a failed old refresh cannot revoke a connection that was concurrently replaced", async () => {
  failure = "invalid";
  gate = async (path) => {
    if (path === "/login/oauth/access_token") {
      row.refreshLeaseId = null;
      row.refreshLeaseUntil = null;
      row.credentialsEncrypted = encrypt(userId, { ...raw(), accessToken: "replacement" });
    }
  };
  await assert.rejects(ensure(userId), { code: "github_verification_pending" });
  assert.equal(row.status, "active");
  assert.equal(decrypt(userId, row.credentialsEncrypted).accessToken, "replacement");
});

test("OAuth errors returned with HTTP 400 still recognize revoked refresh credentials", async () => {
  failure = "http-invalid";
  await assert.rejects(ensure(userId), { code: "github_reauthorization_required" });
  assert.equal(row.credentialsEncrypted, null);
});
test("an App client-secret configuration failure does not revoke the user's connection", async () => {
  failure = "client-config";
  const cipher = row.credentialsEncrypted;
  await assert.rejects(ensure(userId), { code: "github_unavailable" });
  assert.equal(row.credentialsEncrypted, cipher);
  assert.equal(row.status, "active");
});
