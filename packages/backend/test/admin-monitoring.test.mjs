import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Script, runInNewContext } from "node:vm";

// Isolated module checks. No server, real DB/Redis, storage or Stripe traffic.
Object.assign(process.env, {
  ENV: "development",
  DEPLOY_MODE: "hosted",
  DATABASE_URL: "postgresql://test:test@invalid/admin_test",
  ADMIN_USERNAME: "test-operator",
  ADMIN_PASSWORD: "test-password",
  ADMIN_URL_KEY: "test-url-key",
  ADMIN_TOKEN_SECRET: "test-admin-secret-at-least-32-characters",
  GITHUB_APP_ID: "",
  GITHUB_APP_SLUG: "",
  GITHUB_APP_CLIENT_ID: "",
  GITHUB_APP_CLIENT_SECRET: "",
  GITHUB_APP_PRIVATE_KEY_BASE64: "",
  GITHUB_CALLBACK_URL: "",
  GITHUB_WEBHOOK_SECRET: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  S3_ENDPOINT: "",
  S3_BUCKET: "",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
});
const USER = "00000000-0000-4000-8000-000000000001";
const TEAM = "00000000-0000-4000-8000-000000000002";
function teamFixture() {
  return {
    id: TEAM,
    name: "Test workspace",
    slug: "test",
    kind: "team",
    logoBytes: 1024,
    createdAt: new Date(),
    owner: state.user,
    _count: { members: 3, tasks: 5, attachments: 2 },
    members: [{ role: "owner", joinedAt: new Date(), user: { id: USER, username: "test-user" } }],
  };
}
let state;
const hashes = new Map();
const expiry = [];
class Batch {
  commands = [];
  hincrby(...args) {
    this.commands.push(["increment", ...args]);
    return this;
  }
  hgetall(...args) {
    this.commands.push(["read", ...args]);
    return this;
  }
  expire(...args) {
    this.commands.push(["expire", ...args]);
    return this;
  }
  async exec() {
    if (state.redisDown) throw new Error("private redis detail must not escape");
    return this.commands.map(([operation, key, field, amount]) => {
      if (operation === "read") return [null, hashes.get(key) ?? {}];
      if (operation === "expire") {
        expiry.push({ key, seconds: field });
        return [null, 1];
      }
      const row = hashes.get(key) ?? {};
      row[field] = String(Number(row[field] ?? 0) + amount);
      hashes.set(key, row);
      return [null, Number(row[field])];
    });
  }
}
const redis = {
  multi: () => new Batch(),
  pipeline: () => new Batch(),
  ping: async () => {
    if (state.redisDown) throw new Error("private redis address");
    return "PONG";
  },
};
await mock.module("../src/redis.ts", { namedExports: { getRedis: () => redis } });
function matchesJob(job, where) {
  if (where.completedAt === null && job.completedAt !== null) return false;
  if (where.lastErrorCode?.not === null && job.lastErrorCode === null) return false;
  if (where.createdAt?.lt && job.createdAt >= where.createdAt.lt) return false;
  if (where.OR) return where.OR.some((filter) => matchesJob(job, filter));
  return true;
}
const db = {
  $queryRaw: async () => {
    if (state.dbDown) throw new Error("private database credentials");
    return [{ value: 1 }];
  },
  $transaction: async (work) => {
    if (Array.isArray(work)) return Promise.all(work);
    const snapshot = structuredClone(state);
    try {
      return await work(db);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  },
  user: {
    count: async ({ where } = {}) => {
      if (state.statsDown) throw new Error("private SQL error");
      if (where?.createdAt) return 2;
      if (where?.planOverride) return 1;
      if (where?.graceUntil) return 1;
      return 14;
    },
    groupBy: async () => [
      { plan: "free", planOverride: null, _count: { _all: 12 } },
      { plan: "free", planOverride: "pro", _count: { _all: 1 } },
      { plan: "starter", planOverride: null, _count: { _all: 1 } },
    ],
    findUnique: async () => (state.user ? structuredClone(state.user) : null),
    findMany: async () => (state.user ? [structuredClone(state.user)] : []),
    update: async ({ data }) => {
      Object.assign(state.user, data);
      return structuredClone(state.user);
    },
  },
  team: {
    count: async () => 3,
    findMany: async ({ where }) => {
      state.workspaceWhere = where;
      return [teamFixture()];
    },
    findUnique: async () => (state.teamMissing ? null : teamFixture()),
    aggregate: async () => ({ _sum: { logoBytes: 1024 } }),
    groupBy: async () => [{ ownerId: USER, _count: { _all: 3 } }],
  },
  task: {
    count: async () => 5,
    groupBy: async () => [
      { status: "todo", _count: { _all: 3 } },
      { status: "done", _count: { _all: 2 } },
    ],
  },
  attachment: {
    aggregate: async () => ({ _sum: { sizeBytes: 2048 }, _count: { _all: 2 } }),
    groupBy: async () => [{ teamId: TEAM, _sum: { sizeBytes: 2048 } }],
  },
  gitHubAccountConnection: { count: async ({ where }) => (where.verifiedAt ? 1 : 2) },
  gitHubAccountRepository: { count: async () => 3 },
  gitHubSyncJob: {
    count: async ({ where }) => state.jobs.filter((job) => matchesJob(job, where)).length,
    findFirst: async ({ where }) => state.jobs.find((job) => matchesJob(job, where)) ?? null,
    findMany: async ({ where, skip, take, select }) => {
      assert.equal(select.payload, undefined, "Queue must never fetch private payloads");
      return state.jobs.filter((job) => matchesJob(job, where)).slice(skip, skip + take);
    },
  },
  gitHubIssueLink: {
    groupBy: async () => [{ status: "linked", syncStatus: "paused", _count: { _all: 1 } }],
    count: async ({ where }) => (where.OR ? 1 : 2),
    aggregate: async () => ({ _max: { lastSyncedAt: null } }),
  },
  billingReconciliationEvent: { count: async () => 0, findMany: async () => [] },
  adminAuditEvent: {
    create: async ({ data }) => {
      if (state.auditDown) throw new Error("simulated audit failure");
      const event = { id: "audit-1", createdAt: new Date(), ...data };
      state.events.push(event);
      return event;
    },
    count: async () => state.events.length,
    findMany: async ({ skip, take, where }) => {
      state.auditWhere = where;
      return state.events.slice(skip, skip + take);
    },
  },
};
globalThis.__prisma = db;
const { adminRoutes } = await import("../src/routes/admin.ts");
const { issueAdminToken } = await import("../src/lib/admin-token.ts");
const { summarizeCounters, recordOperationalRequest, readOperationalMetrics, safeMetricCode } =
  await import("../src/lib/operational-metrics.ts");
const { auditFilter, billingFilter, supportCaps } = await import("../src/routes/admin-support.ts");
const { planDistribution, attentionJobFilter } = await import("../src/routes/admin-monitoring.ts");
const { requestLogger } = await import("../src/middleware/request-log.ts");
const { Hono } = await import("hono");
const { ADMIN_JS } = await import("../../admin/src/assets.ts");
const { overviewPage, attentionPage, auditPage, loginPage } =
  await import("../../admin/src/pages.ts");
const app = new Hono()
  .route("/api/admin", adminRoutes)
  .onError(() =>
    Response.json({ error: "internal_error", message: "operation failed" }, { status: 500 })
  );
let token;
beforeEach(async () => {
  const now = Date.now();
  state = {
    dbDown: false,
    redisDown: false,
    statsDown: false,
    auditDown: false,
    events: [],
    user: {
      id: USER,
      username: "test-user",
      displayName: null,
      plan: "starter",
      planOverride: null,
      createdAt: new Date(),
      graceUntil: null,
      stripeCustomerId: null,
      periodEnd: null,
      billingStatus: null,
      billingCancelAtPeriodEnd: null,
      billingCancelAt: null,
      billingVerifiedAt: null,
      billingAttemptedAt: null,
      billingErrorCode: null,
      billingInvoiceStatus: null,
      billingInvoiceObservedAt: null,
      githubConnection: null,
      _count: { githubIssueLinks: 0 },
    },
    jobs: [
      {
        id: "retry-job",
        kind: "webhook",
        deliveryId: "delivery-test",
        attempts: 2,
        createdAt: new Date(now - 600000),
        availableAt: new Date(now + 60000),
        lockedUntil: null,
        completedAt: null,
        lastErrorCode: "github_unavailable",
        payload: { private: "must-not-escape" },
      },
      {
        id: "fresh-job",
        kind: "task",
        deliveryId: null,
        attempts: 0,
        createdAt: new Date(now),
        availableAt: new Date(now),
        lockedUntil: null,
        completedAt: null,
        lastErrorCode: null,
      },
    ],
  };
  hashes.clear();
  expiry.length = 0;
  token = await issueAdminToken();
});
const authorized = (options = {}) => ({
  ...options,
  headers: { authorization: `Bearer ${token}`, ...options.headers },
});
const changePlan = (plan, extra = {}) =>
  app.request(
    `/api/admin/users/${USER}/plan`,
    authorized({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, ...extra }),
    })
  );

test("all monitoring and audit reads reject unauthenticated clients", async () => {
  for (const path of [
    "overview",
    "attention",
    "audit",
    "workspaces",
    "billing",
    "billing/history",
  ]) {
    const response = await app.request(`/api/admin/${path}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("overview reports real aggregates, zero-filled buckets and honest config-only checks", async () => {
  const response = await app.request("/api/admin/overview", authorized());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.health.database.status, "healthy");
  assert.equal(body.health.redis.status, "healthy");
  assert.equal(body.health.storage.live_check, false);
  assert.equal(body.snapshot.usage.storage_bytes, 3072);
  assert.equal(body.snapshot.usage.users, 14);
  assert.deepEqual(
    body.snapshot.usage.plans.map((row) => row.count),
    [12, 1, 1, 0]
  );
  assert.equal(
    body.snapshot.usage.task_statuses.find((row) => row.status === "in_progress").count,
    0
  );
  assert.equal(body.snapshot.github.queued, 2);
  assert.equal(body.snapshot.github.pending_over_5m, 1);
  assert.equal(body.snapshot.github.retrying, 1);
  assert.equal(body.metrics.requests, 0);
  assert.equal(body.attention.length, 8);
});
test("unavailable dependencies show unknown counts, not healthy zeroes or exception detail", async () => {
  state.dbDown = true;
  state.redisDown = true;
  const response = await app.request("/api/admin/overview", authorized());
  const body = await response.json();
  assert.equal(body.health.database.status, "unavailable");
  assert.equal(body.health.redis.status, "unavailable");
  assert.equal(body.snapshot, null);
  assert.equal(body.metrics, null);
  assert.ok(body.attention.every((row) => row.count === null));
  assert.equal(JSON.stringify(body).includes("private"), false);
});
test("snapshot query failure is distinguished from a successful DB ping", async () => {
  state.statsDown = true;
  const body = await (await app.request("/api/admin/overview", authorized())).json();
  assert.equal(body.health.database.status, "healthy");
  assert.equal(body.snapshot, null);
  assert.equal(body.metrics.requests, 0);
});
test("attention queue filters retry/overdue jobs, paginates and never exposes payloads", async () => {
  const response = await app.request("/api/admin/attention?page=1", authorized());
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(body.page_size, 25);
  assert.equal(body.jobs[0].id, "retry-job");
  assert.equal(JSON.stringify(body).includes("must-not-escape"), false);
  assert.equal(body.jobs[0].payload, undefined);
  assert.equal((await app.request("/api/admin/attention?page=0", authorized())).status, 400);
  assert.equal((await app.request("/api/admin/audit?page=10001", authorized())).status, 400);
  const second = await (await app.request("/api/admin/attention?page=2", authorized())).json();
  assert.equal(second.jobs.length, 0);
  assert.equal(second.total, 1);
});
test("counter aggregation uses safe codes and ignores malformed counts", () => {
  const body = summarizeCounters([
    { requests: "3", server_errors: "1", "error:github_unavailable": "2" },
    {
      requests: "2",
      billing_failed: "1",
      "error:github_unavailable": "1",
      "error:<private>": "4",
      "error:invalid_input": "-1",
    },
  ]);
  assert.equal(body.requests, 5);
  assert.equal(body.server_errors, 1);
  assert.equal(body.billing_failed, 1);
  assert.equal(body.errors.find((row) => row.code === "github_unavailable").count, 3);
  assert.equal(body.errors.find((row) => row.code === "unknown_error").count, 4);
  assert.equal(safeMetricCode("secret=do-not-record"), "unknown_error");
});
test("minute counters have bounded retention/window and separate billing failures", async () => {
  const now = Date.now();
  await recordOperationalRequest(503, "github_unavailable", false, now);
  await recordOperationalRequest(400, "invalid_signature", true, now);
  await recordOperationalRequest(200, null, true, now - 60000);
  await recordOperationalRequest(500, "old_error", false, now - 61 * 60000);
  const body = await readOperationalMetrics(now);
  assert.equal(body.requests, 3);
  assert.equal(body.server_errors, 1);
  assert.equal(body.billing_received, 1);
  assert.equal(body.billing_failed, 1);
  assert.equal(
    body.errors.some((row) => row.code === "old_error"),
    false
  );
  assert.ok(expiry.every((row) => row.seconds === 7200));
});
test("telemetry failure never fails a request", async () => {
  state.redisDown = true;
  await assert.doesNotReject(recordOperationalRequest(200, null, false));
});
test("HTTP metrics exclude admin/health traffic and don't persist response messages", async () => {
  const logged = new Hono().use("*", requestLogger);
  logged.get("/health", (c) => c.json({ ok: true }));
  logged.get("/api/admin/example", (c) => c.json({ ok: true }));
  logged.get("/api/example", (c) =>
    c.json({ error: "internal_error", message: "private task text" }, 500)
  );
  await logged.request("/health");
  await logged.request("/api/admin/example");
  await logged.request("/api/example");
  await new Promise((resolve) => setImmediate(resolve));
  const body = await readOperationalMetrics();
  assert.equal(body.requests, 1);
  assert.equal(body.server_errors, 1);
  assert.equal(JSON.stringify([...hashes]).includes("private task text"), false);
  assert.equal(JSON.stringify([...hashes]).includes("/api/example"), false);
});
test("real plan changes and audits commit atomically under the authenticated actor", async () => {
  const response = await changePlan("pro");
  assert.equal(response.status, 200);
  assert.equal(state.user.plan, "starter");
  assert.equal(state.user.planOverride, "pro");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].actor, "test-operator");
  assert.equal(state.events[0].fromPlan, null);
  assert.equal(state.events[0].toPlan, "pro");
  assert.equal(JSON.stringify(state.events).includes(token), false);
  await changePlan("pro");
  assert.equal(state.events.length, 1, "No-op must not create an audit event");
  await changePlan("free");
  assert.equal(state.user.planOverride, null);
  assert.equal(state.user.plan, "starter", "Revocation must preserve Stripe's plan");
  assert.equal(state.events[1].fromPlan, "pro");
  assert.equal(state.events[1].toPlan, null);
});
test("failed audit persistence rolls back the grant", async () => {
  state.auditDown = true;
  assert.equal((await changePlan("ultra")).status, 500);
  assert.equal(state.user.planOverride, null);
  assert.equal(state.events.length, 0);
});
test("malformed user IDs are rejected after authentication and do not write audits", async () => {
  assert.equal((await app.request("/api/admin/users/not-a-uuid")).status, 401);
  assert.equal((await app.request("/api/admin/users/not-a-uuid", authorized())).status, 400);
  const response = await app.request(
    "/api/admin/users/not-a-uuid/plan",
    authorized({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    })
  );
  assert.equal(response.status, 400);
  assert.equal(state.user.planOverride, null);
  assert.equal(state.events.length, 0);
});

test("audit actor cannot be forged via input and missing users leave no audit", async () => {
  assert.equal((await changePlan("pro", { actor: "forged" })).status, 400);
  state.user = null;
  assert.equal((await changePlan("pro")).status, 404);
  assert.equal(state.events.length, 0);
});
test("audit reads are paginated and keep safe snapshots for deleted users", async () => {
  state.events.push({
    id: "audit-test",
    actor: "operator",
    action: "plan_override_changed",
    targetUserId: null,
    targetUsername: "deleted-user",
    fromPlan: null,
    toPlan: "starter",
    createdAt: new Date(),
  });
  const body = await (await app.request("/api/admin/audit?page=1", authorized())).json();
  assert.equal(body.total, 1);
  assert.equal(body.events[0].target_username, "deleted-user");
  assert.equal(body.events[0].target_user_id, null);
});
test("effective plan distribution preserves zero-count plans and overdue threshold is five minutes", () => {
  assert.deepEqual(
    planDistribution([{ plan: "starter", planOverride: "ultra", _count: { _all: 2 } }]).map(
      (row) => row.count
    ),
    [0, 0, 0, 2]
  );
  const now = new Date();
  assert.equal(attentionJobFilter(now).OR[1].createdAt.lt.getTime(), now.getTime() - 300000);
});
test("user list surfaces support flags without private content", async () => {
  state.user.graceUntil = new Date();
  state.user.githubConnection = { status: "active", verifiedAt: new Date(Date.now() - 86400001) };
  state.user._count.githubIssueLinks = 2;
  const body = await (await app.request("/api/admin/users", authorized())).json();
  assert.deepEqual(body.users[0].attention_flags, [
    "billing_grace_flag",
    "github_reauthorization_required",
    "github_links_need_attention",
  ]);
});

// Minimal native-DOM harness for the shipped script: all rendering must stay
// createElement/textContent-based, including malicious account/audit strings.
class Element {
  children = [];
  attributes = {};
  dataset = {};
  listeners = {};
  value = "";
  constructor(tag) {
    this.tagName = tag;
  }
  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }
  get textContent() {
    return (
      this.value +
      this.children
        .map((child) => (typeof child === "string" ? child : child.textContent))
        .join(" ")
    );
  }
  append(...children) {
    for (const child of children) {
      if (typeof child !== "string") {
        if (child.parentNode)
          child.parentNode.children = child.parentNode.children.filter((node) => node !== child);
        child.parentNode = this;
      }
      this.children.push(child);
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }
}
async function render(view, data, status = 200) {
  const nodes = {
    app: new Element("main"),
    notice: new Element("p"),
    content: new Element("section"),
  };
  nodes.app.dataset.view = view;
  if (view === "workspace") nodes.app.dataset.workspaceId = TEAM;
  const requests = [];
  runInNewContext(ADMIN_JS, {
    document: { getElementById: (id) => nodes[id], createElement: (tag) => new Element(tag) },
    window: { location: { href: `https://admin.invalid/${view}` } },
    URL,
    URLSearchParams,
    fetch: async (url) => {
      requests.push(url);
      return { ok: status === 200, status, json: async () => structuredClone(data) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { nodes, requests };
}
test("admin pages add protected-view shells and the browser script parses without inline code", () => {
  new Script(ADMIN_JS);
  for (const page of [overviewPage(), attentionPage(), auditPage()]) {
    assert.ok(page.includes('href="/overview"'));
    assert.ok(page.includes('src="/assets/admin.js"'));
    assert.equal(page.includes("<script>"), false);
  }
  assert.equal(ADMIN_JS.includes("innerHTML"), true); // only the existing safety comment
  assert.equal(/\.innerHTML\s*=/.test(ADMIN_JS), false);
  assert.ok(loginPage('<script>"').includes("&lt;script&gt;&quot;"));
});
test("overview renderer shows zeroes and explicitly labels configuration-only service checks", async () => {
  const data = await (await app.request("/api/admin/overview", authorized())).json();
  const { nodes, requests } = await render("overview", data);
  assert.deepEqual(requests, ["/api/overview"]);
  assert.ok(nodes.content.textContent.includes("Config only"));
  assert.ok(nodes.content.textContent.includes("Usage"));
  assert.ok(nodes.content.textContent.includes("Needs attention"));
  assert.ok(nodes.content.textContent.includes("Effective plans include operator grants"));
});
test("redesigned shell groups navigation and marks the active section", () => {
  const page = auditPage();
  assert.ok(page.includes("Accounts &amp; support"));
  assert.ok(page.includes("Governance"));
  assert.ok(page.includes('href="/audit" class="nav-active" aria-current="page"'));
  assert.ok(page.includes('aria-labelledby="page-title"'));
});

test("overview groups every dataset once into five panels", async () => {
  const data = await (await app.request("/api/admin/overview", authorized())).json();
  const { nodes } = await render("overview", data);
  const layout = nodes.content.children.find((node) => node.className === "panel-layout");
  assert.equal(layout.children.length, 5);
  assert.equal(layout.children.filter((node) => node.className.includes("panel-wide")).length, 1);
  assert.equal(nodes.content.children.filter((node) => node.tagName === "h2").length, 0);
  const usage = layout.children.find((node) => node.children[0].textContent === "Usage");
  const breakdown = usage.children.find((node) => node.className === "usage-breakdown");
  assert.equal(
    breakdown.children.filter((node) => node.className.includes("table-scroll")).length,
    2
  );
});

test("light theme uses compact controls with explanatory notes still available", async () => {
  const data = await (await app.request("/api/admin/attention", authorized())).json();
  const { nodes } = await render("attention", data);
  assert.ok(nodes.content.textContent.includes("Queue details"));
  assert.ok(nodes.content.textContent.includes("Jobs awaiting retry or pending over five minutes"));
  assert.equal(nodes.content.textContent.includes("Counts are a snapshot, not a live feed"), false);
  assert.equal(nodes.content.textContent.includes("Refresh snapshot"), false);
});

test("unavailable snapshot renders unknown counts instead of no-problem claims", async () => {
  state.dbDown = true;
  state.redisDown = true;
  const data = await (await app.request("/api/admin/overview", authorized())).json();
  const { nodes } = await render("overview", data);
  assert.ok(nodes.content.textContent.includes("unknown, not zero"));
  assert.ok(nodes.content.textContent.includes("no zero-error claim"));
});
test("audit renderer uses literal text for malicious actor/user values and paginates", async () => {
  const { nodes } = await render("audit", {
    page: 1,
    page_size: 25,
    total: 30,
    events: [
      {
        actor: "<script>bad</script>",
        target_user_id: null,
        target_username: '<img src=x onerror="bad">',
        from_plan: null,
        to_plan: "pro",
        action: "plan_override_changed",
        created_at: new Date().toISOString(),
      },
    ],
  });
  assert.ok(nodes.content.textContent.includes("<script>bad</script>"));
  assert.ok(nodes.content.textContent.includes("(deleted)"));
  assert.ok(nodes.content.textContent.includes("Next"));
});
test("workspace support aggregates metadata only with deployment-aware caps", async () => {
  const body = await (await app.request("/api/admin/workspaces?q=test", authorized())).json();
  assert.equal(body.workspaces[0].storage_bytes, 3072);
  assert.equal(body.workspaces[0].limits.tasks, null);
  assert.equal(body.workspaces[0].limits.members, 8);
  assert.deepEqual(body.workspaces[0].limits, supportCaps(state.user));
  assert.ok(state.workspaceWhere.OR.some((row) => row.owner));
  const detail = await (await app.request(`/api/admin/workspaces/${TEAM}`, authorized())).json();
  assert.equal(detail.workspace.owner_team_count, 3);
  assert.equal(detail.workspace.task_statuses.find((row) => row.status === "in_progress").count, 0);
  assert.equal(detail.workspace.github.issue_links[0].sync_status, "paused");
  assert.equal(detail.workspace.tasks, 5);
  assert.equal(JSON.stringify(detail).includes("passwordHash"), false);
  assert.equal(JSON.stringify(detail).includes("description"), false);
  const { nodes } = await render("workspace", detail);
  assert.ok(nodes.content.textContent.includes("Task totals — no private task content"));
  state.teamMissing = true;
  assert.equal((await app.request(`/api/admin/workspaces/${TEAM}`, authorized())).status, 404);
});
test("billing reads never infer subscription state from an operator grant", async () => {
  state.user.planOverride = "pro";
  const body = await (await app.request("/api/admin/billing", authorized())).json();
  assert.equal(body.users[0].subscription_status, "unknown");
  assert.equal(body.users[0].effective_plan, "pro");
  assert.equal(body.users[0].verified_at, null);
  assert.equal(body.users[0].operator_grant, "pro");
  assert.equal(body.users[0].stripeCustomerId, undefined);
  const { nodes } = await render("billing", { ...body, events: [] });
  assert.ok(nodes.content.textContent.includes("Unknown means not verified"));
  assert.ok(nodes.content.textContent.includes("Reconciliation history"));
  assert.equal((await app.request("/api/admin/billing?status=bogus", authorized())).status, 400);
});
test("billing filters select actual observations, errors and grants independently", () => {
  assert.deepEqual(billingFilter("", "unknown").AND[1], { billingStatus: null });
  assert.deepEqual(billingFilter("", "error").AND[1], { billingErrorCode: { not: null } });
  assert.deepEqual(billingFilter("", "grant").AND[1], { planOverride: { not: null } });
  assert.deepEqual(billingFilter("", "past_due").AND[1], { billingStatus: "past_due" });
});
test("audit filters include deleted-user snapshots, operator, action and inclusive UTC days", async () => {
  const response = await app.request(
    "/api/admin/audit?actor=operator&user=deleted&action=plan_override_changed&from=2026-10-01&to=2026-10-10",
    authorized()
  );
  assert.equal(response.status, 200);
  assert.equal(state.auditWhere.actor.contains, "operator");
  assert.equal(state.auditWhere.OR[0].targetUsername.contains, "deleted");
  assert.equal(state.auditWhere.createdAt.gte.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(state.auditWhere.createdAt.lt.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(auditFilter({ actor: "", user: USER, action: "" }).OR[1].targetUserId, USER);
  assert.equal(
    (await app.request("/api/admin/audit?from=2026-11-01&to=2026-10-01", authorized())).status,
    400
  );
  assert.equal((await app.request("/api/admin/audit?from=invalid", authorized())).status, 400);
  assert.equal(
    (await app.request("/api/admin/audit?action=delete_user", authorized())).status,
    400
  );
});

test("browser monitoring failure reports unavailability and expired sessions", async () => {
  const { nodes } = await render("overview", {}, 401);
  assert.ok(nodes.notice.textContent.includes("Session expired"));
  assert.ok(nodes.content.textContent.includes("Monitoring unavailable"));
});
