import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { Hono } from "hono";
import { createHash } from "node:crypto";
const TEAM = "11111111-1111-4111-8111-111111111111",
  OWNER = "22222222-2222-4222-8222-222222222222",
  SITE = "33333333-3333-4333-8333-333333333333",
  TICKET = "44444444-4444-4444-8444-444444444444",
  TOKEN = "a".repeat(43);
const settings = {
  ENV: "development",
  DEPLOY_MODE: "hosted",
  AUTH_SECRET: "secret".repeat(10),
  AUTH_PUBLIC_URL: "https://app.example.test",
  SUPPORT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SUPPORT_EMAIL_API_URL: "https://email.example.test/send",
  SUPPORT_EMAIL_API_KEY: "private-key",
  SUPPORT_EMAIL_FROM: "Support <support@example.test>",
  AUTH_PROXY_SECRET: "",
  TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_HOSTNAMES: "",
};
let s;
const id = () => crypto.randomUUID();
const date = () => new Date();
const match = (t, w) =>
  (!w.id || t.id === w.id) &&
  (!w.teamId || t.teamId === w.teamId) &&
  (!w.accessHash || t.accessHash === w.accessHash) &&
  (!w.accessExpiresAt || t.accessExpiresAt > w.accessExpiresAt.gt);
const db = {
  $queryRaw: async (_strings, ...values) => {
    s.locks.push(values);
    return [];
  },
  $transaction: async (fn) => fn(db),
  user: { findUnique: async () => s.owner },
  team: {
    findUnique: async ({ where }) =>
      where.id === TEAM ? { id: TEAM, name: "Team", ownerId: OWNER, owner: s.owner } : null,
    findFirst: async ({ where }) =>
      where.id === TEAM && where.ownerId === OWNER ? { id: TEAM, owner: s.owner } : null,
  },
  supportSite: {
    findUnique: async ({ where }) => s.sites.find((r) => r.id === where.id) ?? null,
    findMany: async ({ where }) => s.sites.filter((r) => r.teamId === where.teamId),
    count: async ({ where }) => {
      assert.equal(where.team.ownerId, OWNER);
      return s.siteCount ?? s.sites.length;
    },
    create: async ({ data }) => {
      const r = { id: id(), createdAt: date(), ...data };
      s.sites.push(r);
      return r;
    },
  },
  supportTicket: {
    findUniqueOrThrow: async ({ where }) => {
      const ticket = s.tickets.find((t) => t.id === where.id);
      assert.ok(ticket);
      return ticket;
    },
    findUnique: async ({ where }) =>
      s.tickets.find((t) =>
        where.submissionId ? t.submissionId === where.submissionId : t.id === where.id
      ) ?? null,
    findFirst: async ({ where }) => s.tickets.find((t) => match(t, where)) ?? null,
    findMany: async ({ where }) => s.tickets.filter((t) => t.teamId === where.teamId),
    count: async ({ where }) => {
      assert.equal(where.ownerId, OWNER);
      assert.equal(where.createdAt.gte.getUTCDate(), 1);
      return s.ticketCount ?? s.tickets.length;
    },
    create: async ({ data }) => {
      const r = {
        id: id(),
        status: "open",
        priority: "medium",
        assigneeId: null,
        taskId: null,
        createdAt: date(),
        updatedAt: date(),
        ...data,
      };
      s.tickets.push(r);
      return r;
    },
    update: async ({ where, data }) => {
      const r = s.tickets.find((t) => t.id === where.id);
      assert.ok(r);
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({ where, data }) => {
      const r = s.tickets.find((t) => match(t, where));
      if (r) for (const [k, v] of Object.entries(data)) if (v !== undefined) r[k] = v;
      return { count: r ? 1 : 0 };
    },
  },
  supportMessage: {
    findUnique: async ({ where }) =>
      s.messages.find((m) => m.requestId === where.requestId) ?? null,
    create: async ({ data }) => {
      const r = { id: id(), createdAt: date(), ...data };
      s.messages.push(r);
      return r;
    },
    findMany: async ({ where, take }) =>
      s.messages
        .filter(
          (m) =>
            m.ticketId === where.ticketId &&
            (where.internal === undefined || m.internal === where.internal)
        )
        .slice(0, take),
  },
  supportEmail: {
    create: async ({ data }) => {
      s.emails.push({ id: id(), ...data });
    },
    findFirst: async () => null,
  },
  notification: {
    create: async ({ data }) => {
      s.notifications.push(data);
    },
  },
  workspaceFile: {
    findUnique: async ({ where }) => s.files.find((f) => f.uploadId === where.uploadId) ?? null,
    findFirst: async ({ where }) =>
      s.files.find(
        (f) =>
          f.id === where.id &&
          f.supportTicketId === where.supportTicketId &&
          f.teamId === where.teamId &&
          !f.trashedAt
      ) ?? null,
    findMany: async ({ where }) =>
      s.files.filter((f) => f.supportTicketId === where.supportTicketId && !f.trashedAt),
    count: async ({ where }) =>
      s.files.filter((f) => f.supportTicketId === where.supportTicketId).length,
    create: async ({ data }) => {
      s.files.push(data);
      return data;
    },
  },
  fileObjectDeletion: {
    findUnique: async ({ where }) =>
      s.jobs.find((j) => (where.id ? j.id === where.id : j.uploadId === where.uploadId)) ?? null,
    count: async () => s.jobs.length,
    create: async ({ data }) => {
      const r = { id: id(), attempts: 0, ...data };
      s.jobs.push(r);
      return r;
    },
    delete: async ({ where }) => {
      s.jobs = s.jobs.filter((j) => j.id !== where.id);
    },
    updateMany: async ({ where, data }) => {
      const r = s.jobs.find((j) => j.id === where.id);
      if (r) Object.assign(r, data);
      return { count: r ? 1 : 0 };
    },
  },
  task: {
    findUnique: async ({ where }) => {
      const row = s.tasks.find((t) => t.id === where.id);
      return row
        ? {
            ...row,
            kpiBindings: [],
            creator: { id: OWNER, username: "owner", displayName: null },
            assignee: null,
            subtaskItems: [],
            githubIssueLink: null,
          }
        : null;
    },
    create: async ({ data }) => {
      const r = {
        id: id(),
        status: "todo",
        projectId: null,
        dueDate: null,
        flagged: false,
        createdAt: date(),
        updatedAt: date(),
        assigneeId: null,
        ...data,
      };
      s.tasks.push(r);
      return r;
    },
  },
  taskEvent: {
    create: async ({ data }) => {
      s.events.push(data);
    },
  },
};
await mock.module("../src/env.ts", { namedExports: { env: settings, isHosted: true } });
await mock.module("../src/db.ts", { namedExports: { prisma: db } });
await mock.module("../src/redis.ts", {
  namedExports: {
    getRedis: () => ({
      eval: async () => {
        if (s.redisDown) throw new Error("private redis error");
        return s.rate ? [1000, 60] : [1, 60];
      },
    }),
  },
});
await mock.module("../src/lib/team-membership.ts", {
  namedExports: {
    getTeamRole: async (user, team) => (user === OWNER && team === TEAM ? s.role : null),
  },
});
await mock.module("../src/lib/events.ts", {
  namedExports: {
    publishToTeam: async (teamId, event) => {
      assert.equal(teamId, TEAM);
      s.published.push(event);
    },
  },
});
await mock.module("../src/lib/quota.ts", {
  namedExports: {
    withStorageAccount: async (team, fn) => {
      assert.equal(team, TEAM);
      return fn(db, { ownerId: OWNER, limits: { maxFileBytes: 100 * 1024 ** 2 } });
    },
    storageUploadDenial: async (account, size, replaced) => {
      assert.equal(account.ownerId, OWNER);
      s.quotaCalls.push({ size, replaced });
      return s.quotaFull
        ? { error: "quota_exceeded", message: "Shared storage full", status: 409 }
        : null;
    },
  },
});
await mock.module("../src/lib/storage.ts", {
  namedExports: {
    storageReady: () => true,
    putObject: async ({ key }) => {
      s.puts.push(key);
      if (s.putFail) throw new Error("private storage error");
    },
    getObjectStream: async () => ({ body: new Blob(["image"]).stream() }),
  },
});
const { supportPublicRoutes } = await import("../src/routes/support-public.ts");
const { supportRoutes } = await import("../src/routes/support.ts");
const { encryptSupport, decryptSupport, supportLimits, queueSupportEmail } =
  await import("../src/lib/support.ts");
const pub = new Hono().route("/", supportPublicRoutes),
  team = new Hono()
    .use("*", async (c, next) => {
      c.set("userId", OWNER);
      await next();
    })
    .route("/", supportRoutes),
  base = `/teams/${TEAM}/support`,
  auth = { Authorization: `Bearer ${TOKEN}` };
beforeEach(() => {
  s = {
    owner: { plan: "starter", planOverride: null, username: "owner", displayName: null },
    sites: [
      {
        id: SITE,
        teamId: TEAM,
        name: "Northline",
        origins: ["https://shop.example.test"],
        enabled: true,
        accent: "#6366f1",
        greeting: "Report a request",
      },
    ],
    tickets: [],
    messages: [],
    emails: [],
    notifications: [],
    files: [],
    jobs: [],
    tasks: [],
    events: [],
    locks: [],
    quotaCalls: [],
    puts: [],
    published: [],
    role: "owner",
  };
});
const post = (app, path, data, token) =>
  app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
const input = () => ({
  request_id: id(),
  subject: "Invoice download fails",
  details: "The download button shows an error.",
  request_type: "Report a bug",
  area: "Orders",
  customer_name: "Aisha",
  customer_email: "aisha@example.test",
});
function seed() {
  const t = {
    id: TICKET,
    teamId: TEAM,
    siteId: SITE,
    ownerId: OWNER,
    submissionId: id(),
    submissionHash: "hash",
    reference: "MK-TEST",
    subject: "Invoice",
    details: "Help",
    requestType: "Other",
    area: "Orders",
    customerName: "Aisha",
    customerEmail: "aisha@example.test",
    status: "resolved",
    priority: "medium",
    assigneeId: null,
    taskId: null,
    accessHash: createHash("sha256").update(TOKEN).digest("hex"),
    accessEncrypted: encryptSupport(TOKEN),
    accessExpiresAt: new Date(Date.now() + 86400_000),
    createdAt: date(),
    updatedAt: date(),
  };
  s.tickets.push(t);
  return t;
}
test("approved limits follow the owner's effective plan", () => {
  assert.deepEqual(supportLimits(s.owner), { sites: 1, tickets: 100 });
  assert.deepEqual(supportLimits({ plan: "free", planOverride: "pro" }), {
    sites: 3,
    tickets: 500,
  });
  assert.deepEqual(supportLimits({ plan: "ultra", planOverride: null }), {
    sites: 10,
    tickets: 2000,
  });
});
test("submission is scoped, idempotent and queues encrypted confirmation", async () => {
  const data = input(),
    first = await post(pub, `/sites/${SITE}/tickets`, data);
  assert.equal(first.status, 201);
  const result = await first.json(),
    token = new URL(result.ticket_url).hash.slice(1);
  assert.equal(token.length, 43);
  assert.equal(s.tickets[0].ownerId, OWNER);
  assert.ok(s.locks.length);
  assert.equal(s.notifications.length, 1);
  assert.ok(!JSON.stringify(s.emails).includes(token));
  assert.ok(decryptSupport(s.emails[0].textEncrypted).includes(result.ticket_url));
  const replay = await post(pub, `/sites/${SITE}/tickets`, data);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).ticket.id, result.ticket.id);
  assert.equal(s.tickets.length, 1);
  assert.equal(s.emails.length, 1);
  assert.equal(
    (await post(pub, `/sites/${SITE}/tickets`, { ...data, subject: "Changed" })).status,
    409
  );
});
test("monthly allowance is shared by owner and leaves old tickets readable", async () => {
  seed();
  s.ticketCount = 100;
  assert.equal((await post(pub, `/sites/${SITE}/tickets`, input())).status, 409);
  assert.equal((await pub.request(`/tickets/${TICKET}`, { headers: auth })).status, 200);
  s.owner.plan = "free";
  s.ticketCount = 0;
  assert.equal((await post(pub, `/sites/${SITE}/tickets`, input())).status, 409);
});
test("paused sites, honeypot and oversized submissions are rejected", async () => {
  assert.equal(
    (await post(pub, `/sites/${SITE}/tickets`, { ...input(), website: "spam" })).status,
    400
  );
  s.sites[0].enabled = false;
  assert.equal((await post(pub, `/sites/${SITE}/tickets`, input())).status, 404);
  assert.equal(
    (await post(pub, `/sites/${SITE}/tickets`, { ...input(), details: "x".repeat(70000) })).status,
    413
  );
  assert.equal(s.tickets.length, 0);
});
test("rate protection fails closed and hides provider details", async () => {
  s.redisDown = true;
  const r = await post(pub, `/sites/${SITE}/tickets`, input());
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(await r.json()).includes("private"));
  s.redisDown = false;
  s.rate = true;
  const rate = await post(pub, `/sites/${SITE}/tickets`, input());
  assert.equal(rate.status, 429);
  assert.equal(rate.headers.get("Retry-After"), "60");
});
test("private ticket reads require unexpired capabilities and exclude internal notes", async () => {
  const ticket = seed();
  s.messages.push(
    {
      id: id(),
      ticketId: TICKET,
      author: "Team",
      body: "Private note",
      internal: true,
      createdAt: date(),
    },
    {
      id: id(),
      ticketId: TICKET,
      author: "Team",
      body: "Public reply",
      internal: false,
      createdAt: date(),
    }
  );
  assert.equal((await pub.request(`/tickets/${TICKET}`)).status, 403);
  const data = await (await pub.request(`/tickets/${TICKET}`, { headers: auth })).json();
  assert.equal(data.messages.length, 1);
  assert.equal(data.messages[0].body, "Public reply");
  assert.equal(data.ticket.customer_email, undefined);
  assert.equal(data.ticket.accessEncrypted, undefined);
  ticket.accessExpiresAt = new Date(0);
  assert.equal((await pub.request(`/tickets/${TICKET}`, { headers: auth })).status, 403);
});
test("customer replies reopen tickets, reject internal flags and prevent changed retries", async () => {
  const ticket = seed(),
    data = { request_id: id(), body: "Still broken" };
  assert.equal(
    (await post(pub, `/tickets/${TICKET}/messages`, { ...data, internal: true }, TOKEN)).status,
    400
  );
  assert.equal((await post(pub, `/tickets/${TICKET}/messages`, data, TOKEN)).status, 200);
  assert.equal(ticket.status, "open");
  assert.equal(s.messages[0].internal, undefined);
  assert.equal((await post(pub, `/tickets/${TICKET}/messages`, data, TOKEN)).status, 200);
  assert.equal(s.messages.length, 1);
  assert.equal(
    (await post(pub, `/tickets/${TICKET}/messages`, { ...data, body: "Changed" }, TOKEN)).status,
    409
  );
});
test("team access, owner configuration and shared website caps are enforced", async () => {
  s.role = null;
  assert.equal((await team.request(`${base}/tickets`)).status, 403);
  s.role = "member";
  const data = { name: "Second", origins: ["https://second.example.test"] };
  assert.equal((await post(team, `${base}/sites`, data)).status, 403);
  s.role = "owner";
  assert.equal((await post(team, `${base}/sites`, data)).status, 409);
  s.owner.plan = "pro";
  assert.equal((await post(team, `${base}/sites`, data)).status, 201);
  assert.equal(
    (await post(team, `${base}/sites`, { ...data, origins: ["https://x.example.test/path"] }))
      .status,
    400
  );
});
test("internal notes never send email; public replies queue once", async () => {
  const ticket = seed(),
    note = { request_id: id(), body: "Private", internal: true };
  assert.equal((await post(team, `${base}/tickets/${TICKET}/messages`, note)).status, 200);
  assert.equal(s.emails.length, 0);
  const reply = { request_id: id(), body: "Please retry", internal: false };
  assert.equal((await post(team, `${base}/tickets/${TICKET}/messages`, reply)).status, 200);
  assert.equal(ticket.status, "waiting");
  assert.equal(s.emails.length, 1);
  assert.equal((await post(team, `${base}/tickets/${TICKET}/messages`, reply)).status, 200);
  assert.equal(s.emails.length, 1);
});
test("task conversion creates once, records history and excludes contact details", async () => {
  seed();
  assert.equal((await post(team, `${base}/tickets/${TICKET}/task`, {})).status, 200);
  assert.equal((await post(team, `${base}/tickets/${TICKET}/task`, {})).status, 200);
  assert.equal(s.tasks.length, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.published.length, 1);
  assert.equal(s.published[0].event, "task_created");
  assert.ok(!s.tasks[0].description.includes("aisha@example"));
});
test("assignees must belong to the ticket workspace", async () => {
  seed();
  assert.equal(
    (
      await team.request(`${base}/tickets/${TICKET}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee_id: id() }),
      })
    ).status,
    400
  );
});
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
async function upload(bytes, uploadId = id()) {
  const form = new FormData();
  form.append("file", new File([bytes], "screenshot.png", { type: "image/png" }));
  return pub.request(`/tickets/${TICKET}/files?upload_id=${uploadId}`, {
    method: "POST",
    headers: auth,
    body: form,
  });
}
test("attachments use shared storage with reservations and idempotent retry", async () => {
  seed();
  const uploadId = id();
  assert.equal((await upload(png, uploadId)).status, 201);
  assert.equal(s.files[0].supportTicketId, TICKET);
  assert.equal(s.jobs.length, 0);
  assert.equal(s.quotaCalls.length, 2);
  assert.equal((await upload(png, uploadId)).status, 200);
  assert.equal(s.files.length, 1);
  assert.equal(s.puts.length, 1);
});
test("attachment size, type, shared quota and count are enforced", async () => {
  seed();
  assert.equal((await upload(new Uint8Array(3 * 1024 ** 2 + 1))).status, 400);
  assert.equal((await upload(new Uint8Array([1, 2, 3]))).status, 400);
  s.quotaFull = true;
  assert.equal((await upload(png)).status, 409);
  assert.equal(s.puts.length, 0);
  s.quotaFull = false;
  for (let i = 0; i < 3; i++) assert.equal((await upload(png)).status, 201);
  assert.equal((await upload(png)).status, 409);
});
test("failed uploads retain charged cleanup reservations; downloads are ticket scoped", async () => {
  seed();
  s.putFail = true;
  assert.equal((await upload(png)).status, 503);
  assert.equal(s.jobs.length, 1);
  assert.equal(s.files.length, 0);
  s.files.push({ id: id(), supportTicketId: id(), teamId: TEAM });
  assert.equal(
    (await pub.request(`/tickets/${TICKET}/files/${s.files[0].id}`, { headers: auth })).status,
    404
  );
});
test("configured bot verification requires the support action on an approved hostname", async (t) => {
  const original = {
    ENV: settings.ENV,
    TURNSTILE_SITE_KEY: settings.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: settings.TURNSTILE_SECRET_KEY,
    TURNSTILE_HOSTNAMES: settings.TURNSTILE_HOSTNAMES,
    AUTH_PROXY_SECRET: settings.AUTH_PROXY_SECRET,
  };
  Object.assign(settings, {
    ENV: "production",
    TURNSTILE_SITE_KEY: "site-key",
    TURNSTILE_SECRET_KEY: "secret-key",
    TURNSTILE_HOSTNAMES: "app.example.test",
    AUTH_PROXY_SECRET: "p".repeat(32),
  });
  t.after(() => Object.assign(settings, original));
  let action = "signup";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, hostname: "app.example.test", action })
  );
  assert.equal(
    (await post(pub, `/sites/${SITE}/tickets`, { ...input(), turnstile_token: "verified" })).status,
    400
  );
  assert.equal(s.tickets.length, 0);
  action = "support";
  assert.equal(
    (await post(pub, `/sites/${SITE}/tickets`, { ...input(), turnstile_token: "verified" })).status,
    201
  );
});

test("status updates queue customer email once and renew expired access when the team sends an update", async () => {
  const ticket = seed();
  ticket.status = "open";
  ticket.accessExpiresAt = new Date(0);
  const change = () =>
    team.request(`${base}/tickets/${TICKET}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
  assert.equal((await change()).status, 200);
  assert.equal(s.emails.length, 1);
  assert.ok(ticket.accessExpiresAt > new Date());
  assert.notEqual(ticket.accessHash, createHash("sha256").update(TOKEN).digest("hex"));
  assert.equal((await change()).status, 200);
  assert.equal(s.emails.length, 1);
});

test("queued updates reuse a renewed link even when a caller held an expired snapshot", async () => {
  const ticket = seed();
  ticket.accessExpiresAt = new Date(0);
  const stale = structuredClone(ticket);
  await queueSupportEmail(db, ticket, "First update");
  const latest = decryptSupport(ticket.accessEncrypted);
  await queueSupportEmail(db, stale, "Second update");
  assert.equal(decryptSupport(ticket.accessEncrypted), latest);
  assert.ok(s.emails.every((email) => decryptSupport(email.textEncrypted).includes(`#${latest}`)));
});
