import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";

// Never read real credentials, open sockets, or contact a running Mokara/GitHub
// server. All ORM/API/Redis boundaries below are in-memory test doubles.
process.env.ENV = "development";
process.env.DATABASE_URL = "postgresql://test:test@invalid/mokara_test";
process.env.AUTH_SECRET = "test-auth-secret-not-used-for-requests";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_SLUG = "test-app";
process.env.GITHUB_APP_CLIENT_ID = "test-client";
process.env.GITHUB_APP_CLIENT_SECRET = "test-client-secret";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(
  generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  })
).toString("base64");
process.env.GITHUB_CALLBACK_URL = "http://localhost:4701/api/integrations/github/callback";
process.env.GITHUB_PUBLIC_APP_URL = "";
process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret-at-least-32-characters";

const USER = "00000000-0000-4000-8000-000000000001";
const TASK = "00000000-0000-4000-8000-000000000002";
const TEAM = "00000000-0000-4000-8000-000000000003";
const CONNECTION = "00000000-0000-4000-8000-000000000004";
const LINK = "00000000-0000-4000-8000-000000000005";
const REPOS = [6, 7, 8, 9].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
let state;
let serial = Promise.resolve();
const requests = [];
const messages = [];
let reminders = 0;
let transactionDepth = 0;
let beforeIssuePatch = null;

function applyLinkData(data) {
  const revision =
    typeof data.syncRevision === "object"
      ? state.link.syncRevision + data.syncRevision.increment
      : (data.syncRevision ?? state.link.syncRevision);
  Object.assign(state.link, data, { syncRevision: revision });
}

function linked(include) {
  if (!state.link) return null;
  return structuredClone(
    include
      ? {
          ...state.link,
          task: state.task,
          connection: state.connection,
          repository: state.repository,
        }
      : state.link
  );
}
function taskRow(include) {
  if (!state.task) return null;
  return structuredClone(
    include
      ? {
          ...state.task,
          kpiBindings: [],
          subtaskItems: [],
          creator: null,
          assignee: null,
          githubIssueLink: state.link,
        }
      : state.task
  );
}
function linkMatches(where) {
  if (!state.link) return false;
  if (where.repositoryId && state.link.repositoryId !== where.repositoryId) return false;
  if (where.githubIssueId && state.link.githubIssueId !== where.githubIssueId) return false;
  if (typeof where.issueNumber === "number" && where.issueNumber !== state.link.issueNumber)
    return false;
  if (where.OR)
    return where.OR.some((filter) =>
      filter.issueNumber
        ? filter.issueNumber.in.includes(state.link.issueNumber)
        : state.pullRequests.has(filter.pullRequests.some.pullRequestId)
    );
  return true;
}
const db = {
  $queryRaw: async () => [],
  $transaction: (callback) => {
    const run = serial.then(async () => {
      const snapshot = structuredClone(state);
      transactionDepth++;
      try {
        return await callback(db);
      } catch (error) {
        state = snapshot;
        throw error;
      } finally {
        transactionDepth--;
      }
    });
    serial = run.catch(() => {});
    return run;
  },
  task: {
    findUnique: async ({ include }) => taskRow(include),
    findUniqueOrThrow: async ({ include }) => {
      assert.ok(state.task);
      return taskRow(include);
    },
    update: async ({ data }) => {
      Object.assign(state.task, data, { updatedAt: new Date() });
      return taskRow();
    },
    findMany: async () => [],
  },
  teamMember: {
    findUnique: async () => (state.member ? { role: "member" } : null),
    findMany: async () => {
      reminders++;
      return [];
    },
  },
  taskEvent: {
    create: async ({ data }) => {
      state.events.push(data);
      return data;
    },
  },
  taskDueChange: {
    create: async ({ data }) => {
      state.dueChanges.push(data);
      return data;
    },
  },
  gitHubIssueLink: {
    findUnique: async ({ include }) => linked(include),
    findUniqueOrThrow: async () => {
      assert.ok(state.link);
      return linked();
    },
    findMany: async ({ where }) => (linkMatches(where) ? [linked()] : []),
    count: async () =>
      state.connection.status === "active" &&
      state.connection.verifiedAt >= new Date(Date.now() - 86400000) &&
      state.enabled.has(REPOS[0])
        ? 1
        : 0,
    update: async ({ data }) => {
      applyLinkData(data);
      return linked();
    },
    updateMany: async ({ where, data }) => {
      if (where.repositoryId?.notIn?.includes(state.link.repositoryId)) return { count: 0 };
      if (where.syncRevision !== undefined && where.syncRevision !== state.link.syncRevision)
        return { count: 0 };
      applyLinkData(data);
      return { count: 1 };
    },
  },
  gitHubAccountConnection: {
    findUnique: async () => structuredClone(state.connection),
    updateMany: async ({ data }) => {
      Object.assign(state.connection, data);
      return { count: 1 };
    },
  },
  gitHubAccountInstallation: { findUnique: async () => (state.installationAccess ? {} : null) },
  gitHubAccountRepository: {
    findUnique: async () => (state.enabled.has(REPOS[0]) ? { enabled: true } : { enabled: false }),
    count: async ({ where }) =>
      where.repositoryId.in.filter((id) => state.accessible.has(id)).length,
    updateMany: async ({ where, data }) => {
      const ids = where.repositoryId?.in ?? REPOS;
      for (const id of ids)
        if (data.enabled) state.enabled.add(id);
        else state.enabled.delete(id);
      return { count: ids.length };
    },
  },
  gitHubRepository: {
    findFirst: async ({ where }) =>
      state.repository.active &&
      state.repository.installation.status === "active" &&
      where.githubRepositoryId === state.repository.githubRepositoryId &&
      where.installation.githubInstallationId === 10n
        ? state.repository
        : null,
    updateMany: async ({ data }) => {
      Object.assign(state.repository, data);
      return { count: 1 };
    },
  },
  gitHubInstallation: {
    updateMany: async ({ data }) => {
      Object.assign(state.repository.installation, data);
      return { count: 1 };
    },
  },
  gitHubPullRequestLink: {
    findUnique: async ({ where }) =>
      state.pullRequests.get(where.issueLinkId_pullRequestId.pullRequestId) ?? null,
    upsert: async ({ create, update }) => {
      const previous = state.pullRequests.get(create.pullRequestId);
      state.pullRequests.set(create.pullRequestId, previous ? { ...previous, ...update } : create);
      return create;
    },
  },
  gitHubSyncJob: {
    create: async ({ data }) => {
      const job = {
        id: randomUUID(),
        attempts: 0,
        createdAt: new Date(),
        availableAt: new Date(),
        lockedUntil: null,
        completedAt: null,
        ...data,
      };
      state.jobs.push(job);
      return job;
    },
    upsert: async ({ where, create }) =>
      state.jobs.find((job) => job.deliveryId === where.deliveryId) ??
      db.gitHubSyncJob.create({ data: create }),
    findFirst: async () =>
      state.jobs.find(
        (job) =>
          !job.completedAt &&
          job.availableAt <= new Date() &&
          (!job.lockedUntil || job.lockedUntil <= new Date())
      ) ?? null,
    update: async ({ where, data }) => {
      const job = state.jobs.find((job) => job.id === where.id);
      assert.ok(job);
      Object.assign(job, data);
      return job;
    },
    updateMany: async ({ where, data }) => {
      const job = state.jobs.find((job) => job.id === where.id);
      if (!job || (where.leaseToken !== undefined && where.leaseToken !== job.leaseToken))
        return { count: 0 };
      if (where.OR && (job.completedAt || (job.lockedUntil && job.lockedUntil > new Date())))
        return { count: 0 };
      Object.assign(job, data, { attempts: job.attempts + (data.attempts?.increment ?? 0) });
      return { count: 1 };
    },
  },
};
globalThis.__prisma = db;
await mock.module("../src/redis.ts", {
  namedExports: {
    getRedis: () => ({
      publish: async (channel, body) => messages.push({ channel, data: JSON.parse(body) }),
    }),
  },
});

globalThis.fetch = async (input, options = {}) => {
  assert.equal(transactionDepth, 0, "Network request must not hold a task transaction");
  const url = new URL(String(input));
  assert.equal(url.origin, "https://api.github.com", "Unexpected external request");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ path: url.pathname, method: options.method ?? "GET", body });
  if (state.apiFailure) return Response.json({ message: "simulated outage" }, { status: 503 });
  if (url.pathname.endsWith("/access_tokens"))
    return Response.json({ token: "test-ephemeral-token" });
  if (url.pathname.includes("/git/ref/heads/"))
    return Response.json({}, { status: state.branchExists ? 200 : 404 });
  if (url.pathname.endsWith("/pulls/456")) return Response.json(state.remotePr);
  if (url.pathname === "/graphql")
    return Response.json({
      data: {
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: state.prNumbers.map((number) => ({ number, repository: { databaseId: 100 } })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    });
  if (url.pathname.endsWith("/issues/123")) {
    if (options.method === "PATCH" && beforeIssuePatch) await beforeIssuePatch();
    if (options.method === "PATCH")
      Object.assign(state.remoteIssue, {
        state: body.state,
        updated_at: new Date(Date.now() + 2000).toISOString(),
      });
    return Response.json(state.remoteIssue);
  }
  throw new Error(`Unexpected GitHub test URL: ${url.pathname}`);
};

const rules = await import("../src/lib/github-sync-rules.ts");
const { activateGitHubRepositories, repositorySelectionError } =
  await import("../src/lib/github-repositories.ts");
const { processGitHubJob, enqueueGitHubTaskSync, drainGitHubSyncJobs } =
  await import("../src/lib/github-sync.ts");
const { githubWebhookRoutes } = await import("../src/routes/github-webhook.ts");
const { taskRoutes } = await import("../src/routes/tasks.ts");
const { githubRoutes } = await import("../src/routes/github.ts");
const { Hono } = await import("hono");
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("userId", USER);
    c.set("username", "test-user");
    await next();
  })
  .route("/", taskRoutes)
  .route("/", githubRoutes)
  .onError(() =>
    Response.json(
      { error: "test_internal_error", message: "Test mutation failed" },
      { status: 500 }
    )
  );

beforeEach(() => {
  requests.length = 0;
  messages.length = 0;
  reminders = 0;
  beforeIssuePatch = null;
  state = {
    member: true,
    installationAccess: true,
    branchExists: true,
    apiFailure: false,
    task: {
      id: TASK,
      teamId: TEAM,
      title: "Test task",
      description: "",
      status: "todo",
      priority: "medium",
      flagged: false,
      projectId: null,
      dueDate: null,
      assigneeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    connection: {
      id: CONNECTION,
      userId: USER,
      githubUserId: 11n,
      status: "active",
      verifiedAt: new Date(),
    },
    repository: {
      id: REPOS[0],
      active: true,
      githubRepositoryId: 100n,
      ownerLogin: "test",
      name: "repository",
      installation: { githubInstallationId: 10n, status: "active" },
    },
    link: {
      id: LINK,
      taskId: TASK,
      repositoryId: REPOS[0],
      connectionId: CONNECTION,
      status: "linked",
      githubIssueId: 101n,
      issueNumber: 123,
      issueState: "open",
      githubUpdatedAt: null,
      localStatusAt: null,
      syncRevision: 0,
      desiredState: null,
      syncStatus: "idle",
      syncErrorCode: null,
      lastSyncedAt: null,
      repositoryFullName: "test/repository",
    },
    accessible: new Set(REPOS),
    enabled: new Set([REPOS[0]]),
    events: [],
    dueChanges: [],
    jobs: [],
    pullRequests: new Map(),
    prNumbers: [123],
    remoteIssue: {
      id: 101,
      number: 123,
      state: "open",
      updated_at: new Date(Date.now() - 60000).toISOString(),
      html_url: "https://github.com/test/repository/issues/123",
      body: "",
    },
    remotePr: {
      id: 102,
      number: 456,
      state: "open",
      updated_at: new Date(Date.now() + 2000).toISOString(),
      head: { ref: "feature/explicit-link" },
    },
  };
});
const issueEvent = (action) => ({
  event: "issues",
  installationId: 10,
  repositoryId: 100,
  actor: "github-collaborator",
  action,
  issueId: 101,
  number: 123,
  updatedAt: state.remoteIssue.updated_at,
});
const prEvent = (action) => ({
  event: "pull_request",
  installationId: 10,
  repositoryId: 100,
  actor: "github-collaborator",
  action,
  pullRequestId: 102,
  number: 456,
  updatedAt: state.remotePr.updated_at,
});
const branchEvent = (ref = "issue-123-fix") => ({
  event: "create",
  installationId: 10,
  repositoryId: 100,
  actor: "github-collaborator",
  ref,
});
const patches = () => requests.filter((request) => request.method === "PATCH");

test("signature checks authenticate exact raw bytes and reject malformed headers", () => {
  const bytes = Buffer.from('{"hello":"world"}');
  const signature = `sha256=${createHmac("sha256", "secret").update(bytes).digest("hex")}`;
  assert.equal(rules.validGitHubSignature(bytes, signature, "secret"), true);
  for (const header of [undefined, "", "sha1=abc", "sha256=aa", `sha256=${"00".repeat(32)}`])
    assert.equal(rules.validGitHubSignature(bytes, header, "secret"), false);
  assert.equal(rules.validGitHubSignature(Buffer.from("different"), signature, "secret"), false);
});

test("branch associations only accept explicit issue-number conventions", () => {
  for (const ref of ["issue-123-fix", "123-fix", "issue-123", "123/fix"])
    assert.equal(rules.branchIssueNumber(ref), 123);
  for (const ref of [
    "main",
    "feature-123",
    "issue-0-fix",
    "issue-123abc",
    "issue-9999999999999999999-fix",
    "issue-2147483648-fix",
  ])
    assert.equal(rules.branchIssueNumber(ref), null);
});

test("three-repository quota is enforced server-side and rejects inaccessible or duplicate IDs", async () => {
  assert.equal(repositorySelectionError(REPOS), "github_repository_limit");
  assert.equal(repositorySelectionError([REPOS[0], REPOS[0]]), "invalid_input");
  assert.equal(await activateGitHubRepositories(USER, REPOS), "github_repository_limit");
  state.accessible.delete(REPOS[3]);
  assert.equal(await activateGitHubRepositories(USER, [REPOS[3]]), "github_repository_forbidden");
  assert.equal(await activateGitHubRepositories(USER, REPOS.slice(0, 3)), null);
  assert.equal(state.enabled.size, 3);
  state.accessible.add(REPOS[3]);
  await Promise.all([
    activateGitHubRepositories(USER, REPOS.slice(0, 3)),
    activateGitHubRepositories(USER, REPOS.slice(1)),
  ]);
  assert.deepEqual([...state.enabled], REPOS.slice(1));
  assert.equal(await activateGitHubRepositories(USER, []), null);
  assert.equal(state.enabled.size, 0);
  assert.equal(state.link.syncStatus, "paused");
});

test("expired verification prevents activation", async () => {
  state.connection.verifiedAt = new Date(Date.now() - 86400001);
  assert.equal(
    await activateGitHubRepositories(USER, [REPOS[0]]),
    "github_reauthorization_required"
  );
});

test("normal task PATCH saves history and outbox atomically; Done closes GitHub", async () => {
  const response = await app.request(`/tasks/${TASK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).github_issue.sync_status, "pending");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].actorId, USER);
  assert.equal(state.jobs.length, 1);
  await drainGitHubSyncJobs();
  assert.equal(state.remoteIssue.state, "closed");
  assert.equal(state.link.syncStatus, "synced");
  assert.equal(patches().length, 1);
  assert.equal(patches()[0].body.state_reason, "completed");
  assert.equal(state.jobs[0].completedAt instanceof Date, true);
  assert.ok(
    requests
      .filter((request) => request.path.endsWith("access_tokens"))
      .every((request) => request.body.repository_ids[0] === 100)
  );
});

test("Mokara Done → Todo reopens GitHub and its webhook echo preserves Todo", async () => {
  state.task.status = "done";
  state.remoteIssue.state = "closed";
  state.link.issueState = "closed";
  state.link.githubUpdatedAt = new Date(state.remoteIssue.updated_at);
  const response = await app.request(`/tasks/${TASK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "todo" }),
  });
  assert.equal(response.status, 200);
  await drainGitHubSyncJobs();
  assert.equal(state.remoteIssue.state, "open");
  await processGitHubJob("webhook", issueEvent("reopened"));
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 1);
  assert.equal(patches().length, 1);
});

for (const reason of ["completed", "not_planned"])
  test(`GitHub issue closed (${reason}) completes the task without a PR`, async () => {
    state.remoteIssue.state = "closed";
    state.remoteIssue.state_reason = reason;
    await processGitHubJob("webhook", issueEvent("closed"));
    assert.equal(state.task.status, "done");
    assert.equal(state.events[0].source, "github");
    assert.equal(state.events[0].actorId, null);
    assert.equal(state.events[0].githubLogin, "github-collaborator");
    assert.equal(patches().length, 0);
    assert.ok(
      messages.some(
        (message) => message.data.event === "task_updated" && message.data.data.status === "done"
      )
    );
    assert.ok(reminders > 0);
    await processGitHubJob("webhook", issueEvent("closed"));
    assert.equal(state.events.length, 1);
  });

test("GitHub reopening an issue moves Done to In progress", async () => {
  state.task.status = "done";
  state.link.issueState = "closed";
  await processGitHubJob("webhook", issueEvent("reopened"));
  assert.equal(state.task.status, "in_progress");
  assert.equal(state.events.length, 1);
  assert.equal(state.remoteIssue.state, "open");
});

for (const merged of [true, false])
  test(`closing a linked PR (merged=${merged}) completes task and closes issue`, async () => {
    state.remotePr.state = "closed";
    state.remotePr.merged = merged;
    await processGitHubJob("webhook", prEvent("closed"));
    await drainGitHubSyncJobs();
    assert.equal(state.task.status, "done");
    assert.equal(state.remoteIssue.state, "closed");
    assert.equal(state.events.length, 1);
    assert.equal(state.pullRequests.size, 1);
  });

test("reopening a linked PR reopens its issue and task; remembered association survives body edits", async () => {
  state.remotePr.state = "closed";
  await processGitHubJob("webhook", prEvent("closed"));
  await drainGitHubSyncJobs();
  state.remotePr.state = "open";
  state.remotePr.updated_at = new Date(Date.now() + 5000).toISOString();
  state.prNumbers = [];
  await processGitHubJob("webhook", prEvent("reopened"));
  await drainGitHubSyncJobs();
  assert.equal(state.task.status, "in_progress");
  assert.equal(state.remoteIssue.state, "open");
  assert.equal(state.events.length, 2);
});

for (const kind of ["branch", "pr"])
  test(`linked ${kind} creation starts work without closing its issue`, async () => {
    await processGitHubJob("webhook", kind === "branch" ? branchEvent() : prEvent("opened"));
    assert.equal(state.task.status, "in_progress");
    assert.equal(state.remoteIssue.state, "open");
    assert.equal(patches().length, 0);
  });

test("unlinked PRs and unknown issue/repository IDs never change a task", async () => {
  state.prNumbers = [];
  await processGitHubJob("webhook", prEvent("opened"));
  await processGitHubJob("webhook", { ...issueEvent("closed"), issueId: 999 });
  await processGitHubJob("webhook", { ...issueEvent("closed"), installationId: 999 });
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

test("delayed branch/PR creation cannot downgrade a completed task", async () => {
  state.task.status = "done";
  state.remoteIssue.state = "closed";
  await processGitHubJob("webhook", branchEvent());
  await processGitHubJob("webhook", prEvent("opened"));
  assert.equal(state.task.status, "done");
  assert.equal(state.events.length, 0);
  assert.equal(patches().length, 0);
});

test("stale close delivery reads current reopened state, never an old closed payload", async () => {
  state.task.status = "in_progress";
  await processGitHubJob("webhook", issueEvent("closed"));
  assert.equal(state.task.status, "in_progress");
  assert.equal(state.events.length, 0);
});

test("old remote transitions cannot override a newer local status change", async () => {
  state.link.localStatusAt = new Date(Date.now());
  state.remoteIssue.state = "closed";
  await processGitHubJob("webhook", issueEvent("closed"));
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

for (const pause of [
  "inactive",
  "disconnected",
  "expired",
  "nonmember",
  "suspended",
  "installationAccess",
])
  test(`${pause} access pauses synchronization without a GitHub API write`, async () => {
    if (pause === "installationAccess") state.installationAccess = false;
    if (pause === "inactive") state.enabled.clear();
    if (pause === "disconnected") state.connection.status = "revoked";
    if (pause === "expired") state.connection.verifiedAt = new Date(Date.now() - 86400001);
    if (pause === "nonmember") state.member = false;
    if (pause === "suspended") state.repository.installation.status = "suspended";
    state.task.status = "done";
    await processGitHubJob("task", { taskId: TASK });
    assert.equal(state.link.syncStatus, "paused");
    assert.equal(requests.length, 0);
  });

test("outage preserves task and leaves durable retry; a later attempt converges", async () => {
  state.task.status = "done";
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  state.apiFailure = true;
  await drainGitHubSyncJobs();
  assert.equal(state.task.status, "done");
  assert.equal(state.link.syncStatus, "failed");
  assert.equal(state.jobs[0].completedAt, null);
  assert.equal(state.jobs[0].attempts, 1);
  assert.ok(state.jobs[0].availableAt > new Date());
  state.apiFailure = false;
  state.jobs[0].availableAt = new Date(0);
  await drainGitHubSyncJobs();
  assert.equal(state.remoteIssue.state, "closed");
  assert.equal(state.link.syncStatus, "synced");
});

test("expired worker lease is recovered, but a live lease isn't processed twice", async () => {
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  state.jobs[0].lockedUntil = new Date(Date.now() + 60000);
  await drainGitHubSyncJobs();
  assert.equal(requests.length, 0);
  state.jobs[0].lockedUntil = new Date(0);
  await drainGitHubSyncJobs();
  assert.ok(state.jobs[0].completedAt);
});

test("signed webhook is public, durable, deduplicated and strips private content", async () => {
  const body = JSON.stringify({
    action: "closed",
    installation: { id: 10 },
    repository: { id: 100 },
    sender: { login: "collaborator" },
    issue: {
      id: 101,
      number: 123,
      updated_at: new Date().toISOString(),
      body: "private body must not persist",
    },
  });
  const delivery = randomUUID();
  const signature = `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET).update(body).digest("hex")}`;
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-github-delivery": delivery,
      "x-hub-signature-256": signature,
    },
    body,
  };
  assert.equal(
    (await githubWebhookRoutes.request("/integrations/github/webhook", options)).status,
    202
  );
  assert.equal(
    (await githubWebhookRoutes.request("/integrations/github/webhook", options)).status,
    202
  );
  assert.equal(state.jobs.length, 1);
  assert.equal(JSON.stringify(state.jobs[0].payload).includes("private body"), false);
  assert.equal(
    (
      await githubWebhookRoutes.request("/integrations/github/webhook", {
        ...options,
        body: body + " ",
      })
    ).status,
    401
  );
  assert.equal(state.jobs.length, 1);
});

test("irrelevant tag and PR-shaped issue webhooks are ignored", () => {
  assert.equal(
    rules.parseGitHubWebhook("create", {
      installation: { id: 10 },
      repository: { id: 100 },
      sender: { login: "test" },
      ref_type: "tag",
      ref: "issue-123-fix",
    }),
    null
  );
  assert.equal(
    rules.parseGitHubWebhook("issues", {
      action: "closed",
      installation: { id: 10 },
      repository: { id: 100 },
      sender: { login: "test" },
      issue: { id: 101, number: 123, updated_at: new Date().toISOString(), pull_request: {} },
    }),
    null
  );
});

test("uninstall/repository removal/revocation pause existing links without deleting history", async () => {
  await processGitHubJob("webhook", {
    event: "installation",
    installationId: 10,
    action: "deleted",
  });
  assert.equal(state.repository.installation.status, "removed");
  assert.equal(state.link.syncStatus, "paused");
  assert.equal(state.enabled.size, 0);
  assert.ok(state.link);
});

test("local task edits finish while an older GitHub write is in flight; corrective outbox converges", async () => {
  state.task.status = "done";
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  beforeIssuePatch = async () => {
    entered.resolve();
    await release.promise;
  };
  const outdated = processGitHubJob("task", { taskId: TASK });
  await entered.promise;
  const response = await app.request(`/tasks/${TASK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "todo" }),
  });
  assert.equal(response.status, 200);
  assert.equal(state.task.status, "todo");
  release.resolve();
  await assert.rejects(outdated, (error) => error.code === "github_sync_conflict");
  // An echo of that raced close must not overwrite pending Todo intent.
  await processGitHubJob("webhook", issueEvent("closed"));
  assert.equal(state.task.status, "todo");
  beforeIssuePatch = null;
  await drainGitHubSyncJobs();
  assert.equal(state.remoteIssue.state, "open");
  assert.equal(state.link.desiredState, null);
  assert.equal(state.link.syncStatus, "synced");
  assert.equal(state.events.length, 1);
});

test("outbox persistence failure rolls back task and activity atomically", async (t) => {
  const mocked = mock.method(db.gitHubSyncJob, "create", async () => {
    throw new Error("simulated outbox write failure");
  });
  t.after(() => mocked.mock.restore());
  const response = await app.request(`/tasks/${TASK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(response.status, 500);
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
  assert.equal(state.jobs.length, 0);
});

test("deleted branches cannot spuriously start a task", async () => {
  state.branchExists = false;
  await processGitHubJob("webhook", branchEvent());
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

test("a delayed PR-close delivery observes the current reopened PR, not completion", async () => {
  state.task.status = "done";
  state.remoteIssue.state = "closed";
  state.link.issueState = "closed";
  await processGitHubJob("webhook", prEvent("closed"));
  await drainGitHubSyncJobs();
  assert.equal(state.task.status, "in_progress");
  assert.equal(state.remoteIssue.state, "open");
});

test("body limits and malformed delivery/JSON are rejected before persistence", async () => {
  const request = (body, delivery = randomUUID()) =>
    githubWebhookRoutes.request("/integrations/github/webhook", {
      method: "POST",
      headers: {
        "x-github-event": "issues",
        "x-github-delivery": delivery,
        "x-hub-signature-256": `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET).update(body).digest("hex")}`,
      },
      body,
    });
  assert.equal((await request("{")).status, 400);
  assert.equal((await request("{}", "not-a-uuid")).status, 400);
  assert.equal((await request("x".repeat(1024 * 1024 + 1))).status, 413);
  assert.equal(state.jobs.length, 0);
});

test("repository activation endpoint rejects a forged fourth repo with a mapped conflict", async () => {
  const response = await app.request("/me/integrations/github/repositories", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository_ids: REPOS }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "github_repository_limit");
  assert.equal(state.enabled.size, 1);
});

test("publishing authorization requires this user's enabled repository join, not just installation access", async (t) => {
  const repository = mock.method(db.gitHubRepository, "findFirst", async ({ where }) => {
    assert.deepEqual(where.connections.some, {
      enabled: true,
      connection: { userId: USER, status: "active" },
    });
    assert.equal(where.installation.connections.some.connection.userId, USER);
    return null;
  });
  t.after(() => repository.mock.restore());
  const response = await app.request(`/tasks/${TASK}/github-issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository_id: REPOS[3] }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "github_repository_forbidden");
  assert.equal(requests.length, 0);
});

test("Mokara Done → In progress reopens the issue without changing the selected local status", async () => {
  state.task.status = "done";
  state.remoteIssue.state = "closed";
  state.link.issueState = "closed";
  const response = await app.request(`/tasks/${TASK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(response.status, 200);
  await drainGitHubSyncJobs();
  assert.equal(state.task.status, "in_progress");
  assert.equal(state.remoteIssue.state, "open");
});

test("editing a previously closed PR cannot undo a later local reopening", async () => {
  state.remotePr.state = "closed";
  await processGitHubJob("webhook", prEvent("closed"));
  await drainGitHubSyncJobs();
  state.task.status = "todo";
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  await drainGitHubSyncJobs();
  state.remotePr.updated_at = new Date(Date.now() + 6000).toISOString();
  await processGitHubJob("webhook", prEvent("edited"));
  assert.equal(state.task.status, "todo");
  assert.equal(state.remoteIssue.state, "open");
});

test("a stale PR-close timestamp isn't made fresh by subsequent unrelated PR metadata edits", async () => {
  state.link.localStatusAt = new Date();
  state.remotePr.state = "closed";
  state.remotePr.updated_at = new Date(Date.now() + 6000).toISOString();
  await processGitHubJob("webhook", {
    ...prEvent("closed"),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  });
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

test("a worker that loses lease ownership cannot acknowledge another worker's job", async () => {
  state.task.status = "done";
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  beforeIssuePatch = async () => {
    state.jobs[0].leaseToken = randomUUID();
  };
  await drainGitHubSyncJobs();
  assert.equal(state.jobs[0].completedAt, null);
});

test("an old issue-close delivery isn't refreshed by later issue metadata changes", async () => {
  state.link.localStatusAt = new Date();
  state.remoteIssue.updated_at = new Date(Date.now() + 6000).toISOString();
  await processGitHubJob("webhook", {
    ...issueEvent("closed"),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  });
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

test("later issue metadata edits cannot turn our delayed reopen echo into a Todo downgrade", async () => {
  state.task.status = "todo";
  state.remoteIssue.state = "closed";
  state.link.issueState = "closed";
  await db.$transaction((tx) => enqueueGitHubTaskSync(tx, TASK));
  await drainGitHubSyncJobs();
  const echo = issueEvent("reopened");
  state.remoteIssue.updated_at = new Date(Date.now() + 6000).toISOString();
  await processGitHubJob("webhook", echo);
  assert.equal(state.task.status, "todo");
  assert.equal(state.events.length, 0);
});

test("installation and repository enumeration includes pages after the first 100", async (t) => {
  const github = await import("../src/lib/github.ts");
  const pages = [];
  const mocked = mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.github.com");
    if (url.pathname.endsWith("access_tokens"))
      return Response.json({ token: "test-ephemeral-token" });
    const page = Number(url.searchParams.get("page"));
    pages.push(page);
    const count = page === 1 ? 100 : 1;
    const rows = Array.from({ length: count }, (_, index) => ({
      id: (page - 1) * 100 + index + 1,
    }));
    if (url.pathname === "/user/installations")
      return Response.json({
        installations: rows.map((row) => ({
          ...row,
          account: { id: row.id, login: "test", type: "User" },
        })),
      });
    return Response.json({
      repositories: rows.map((row) => ({
        ...row,
        owner: { login: "test" },
        name: `repo-${row.id}`,
        full_name: `test/repo-${row.id}`,
        private: false,
      })),
    });
  });
  t.after(() => mocked.mock.restore());
  assert.equal((await github.listUserInstallations("test-token")).length, 101);
  assert.equal((await github.listUserInstallationRepositories("test-token", 10n)).length, 101);
  assert.equal((await github.listInstallationRepositories(10n)).length, 101);
  assert.deepEqual(pages, [1, 2, 1, 2, 1, 2]);
});
