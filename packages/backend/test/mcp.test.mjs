import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
const workspace = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
let connection, member, rate, redisDown, tasks, queries, created, revoked, databaseDown, toolDown;
const logs = [];
const env = {
  AUTH_SECRET: "mcp-test-only-secret",
  MCP_ALLOWED_ORIGINS: "https://mokara.example",
  CORS_ALLOWED_ORIGINS: "*",
};
const prisma = {
  mcpConnection: {
    findUnique: async ({ where }) => {
      if (databaseDown) throw Error("private credential value");
      queries.push(["credential", where]);
      return connection;
    },
    findMany: async ({ where }) => {
      assert.equal(where.userId, userId);
      return connection ? [connection] : [];
    },
    create: async ({ data }) => {
      created = data;
      return { ...data, id: taskId, createdAt: new Date(), revokedAt: null };
    },
    updateMany: async ({ where, data }) => {
      revoked = { where, data };
      return { count: 1 };
    },
  },
  teamMember: {
    findUnique: async ({ where }) => {
      queries.push(["membership", where]);
      return member ? { role: "member" } : null;
    },
    findMany: async ({ where }) =>
      where.userId
        ? member
          ? [{ teamId: workspace }]
          : []
        : [{ userId, role: "owner", user: { id: userId, username: "kai", displayName: null } }],
  },
  team: {
    findMany: async (query) => {
      queries.push(["workspaces", query]);
      return [{ id: workspace, name: "Workspace", slug: "workspace", kind: "team" }];
    },
  },
  task: {
    findMany: async (query) => {
      if (toolDown) throw Error("private task value");
      queries.push(["tasks", query]);
      return tasks;
    },
    findFirst: async (query) => {
      queries.push(["task", query]);
      return query.where.id === taskId && query.where.teamId === workspace
        ? { ...taskRow(taskId), description: "Untrusted content", creator: null, assignee: null }
        : null;
    },
  },
  project: {
    findMany: async () => [
      { id: taskId, name: "Project", color: null, scope: "team", archived: false, ownerId: userId },
    ],
  },
  comment: {
    findMany: async () => [
      {
        id: taskId,
        body: "Comment",
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { id: userId, username: "kai", displayName: null },
      },
    ],
  },
};
mock.module("../src/lib/github-access.ts", {
  namedExports: { ensureGitHubAccess: async () => {} },
});
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/env.ts", {
  namedExports: { env, githubConfigured: false, storageConfigured: false },
});
mock.module("../src/redis.ts", {
  namedExports: {
    getRedis: () => ({
      eval: async () => {
        if (redisDown) throw Error("secret database address");
        return [rate, 60];
      },
    }),
  },
});
mock.module("../src/lib/logger.ts", {
  namedExports: {
    log: {
      info: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
  },
});
const { newCredential, hashCredential } = await import("../src/mcp/access.ts");
const { createMcpConnectionSchema } = await import("../src/lib/validation.ts");
const { mcpRoutes } = await import("../src/mcp/routes.ts");
const { mcpConnectionRoutes } = await import("../src/mcp/connections.ts");
const { corsMiddleware } = await import("../src/middleware/cors.ts");
const credential = newCredential();
const app = new Hono();
app.use("*", corsMiddleware);
app.route("/api/mcp", mcpRoutes);
const settings = new Hono();
settings.use("*", async (c, next) => {
  c.set("userId", userId);
  await next();
});
settings.route("/connections", mcpConnectionRoutes);
function taskRow(id) {
  return {
    id,
    teamId: workspace,
    title: "Task",
    status: "todo",
    priority: "medium",
    projectId: null,
    assigneeId: null,
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
beforeEach(() => {
  databaseDown = false;
  toolDown = false;
  logs.length = 0;
  member = true;
  rate = 1;
  redisDown = false;
  queries = [];
  created = null;
  revoked = null;
  tasks = [];
  connection = {
    id: taskId,
    name: "Agent",
    userId,
    tokenHash: credential.tokenHash,
    workspaceIds: [workspace],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  };
});
async function rpc(method, params = {}, extraHeaders = {}, body) {
  return app.request("/api/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
async function call(name, args) {
  const response = await rpc("tools/call", { name, arguments: args });
  assert.equal(response.status, 200);
  return (await response.json()).result;
}
function toolError(response) {
  assert.equal(response.isError, true);
  return JSON.parse(response.content[0].text);
}

test("credentials are random and only SHA-256 digests persist", () => {
  assert.match(credential.token, /^mk_mcp_[A-Za-z0-9_-]{43}$/);
  assert.match(credential.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(hashCredential(credential.token), credential.tokenHash);
  assert.notEqual(newCredential().token, credential.token);
});
test("stateless transport lists read tools but hides all writes from legacy connections", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, "mokara");
  assert.equal(init.headers.get("mcp-session-id"), null);
  assert.equal(init.headers.get("cache-control"), "no-store");
  const tools = (await (await rpc("tools/list")).json()).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "get_analytics",
    "get_kpi_progress",
    "get_project",
    "get_task",
    "get_task_details",
    "get_workspace_progress",
    "list_attachments",
    "list_comments",
    "list_kpis",
    "list_members",
    "list_operations",
    "list_projects",
    "list_tasks",
    "list_workspaces",
    "read_attachment",
  ]);
  assert.ok(
    tools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint)
  );
});
test("cookies, malformed credentials, expired and revoked connections cannot authenticate", async () => {
  for (const Authorization of ["", "Bearer wrong"]) {
    const response = await rpc(
      "tools/list",
      {},
      { Authorization, Cookie: "mokara_token=browser-session" }
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /Bearer/);
  }
  connection = null;
  assert.equal((await rpc("tools/list")).status, 401);
  connection = { expiresAt: new Date(0) };
  assert.equal((await rpc("tools/list")).status, 401);
  connection = { expiresAt: new Date(Date.now() + 86400000), revokedAt: new Date() };
  assert.equal((await rpc("tools/list")).status, 401);
});
test("workspace allow-list and current membership deny access before task queries", async () => {
  assert.equal(
    toolError(await call("list_tasks", { workspace_id: other })).error,
    "mcp_workspace_forbidden"
  );
  assert.ok(!queries.some(([name]) => name === "tasks"));
  member = false;
  assert.equal(
    toolError(await call("get_task", { workspace_id: workspace, task_id: taskId })).error,
    "mcp_workspace_forbidden"
  );
  assert.ok(!queries.some(([name]) => name === "task"));
});
test("task and comment reads constrain IDs to authorized workspaces", async () => {
  for (const name of ["get_task", "list_comments"])
    assert.equal(
      toolError(await call(name, { workspace_id: workspace, task_id: other })).error,
      "not_found"
    );
  assert.ok(
    queries
      .filter(([name]) => name === "task")
      .every(([, query]) => query.where.teamId === workspace)
  );
  const response = await call("get_task", { workspace_id: workspace, task_id: taskId });
  assert.equal(response.structuredContent.task.description, "Untrusted content");
  assert.equal(response.structuredContent.task.creator, null);
});
test("bounded pagination retains filters; public lists omit account credentials", async () => {
  tasks = [taskRow(taskId), taskRow(other)];
  const response = await call("list_tasks", {
    workspace_id: workspace,
    limit: 1,
    cursor: userId,
    status: "done",
    search: "Task",
    due_before: "2027-01-01T00:00:00Z",
  });
  assert.equal(response.structuredContent.items.length, 1);
  assert.equal(response.structuredContent.next_cursor, taskId);
  const query = queries.find(([name]) => name === "tasks")[1];
  assert.deepEqual(query.where.id, { gt: userId });
  assert.equal(query.where.status, "done");
  assert.equal(query.where.title.contains, "Task");
  assert.equal(query.take, 2);
  await call("list_workspaces", {});
  const workspaceQuery = queries.find(([name]) => name === "workspaces")[1];
  assert.deepEqual(workspaceQuery.where.id.in, [workspace]);
  assert.equal(workspaceQuery.where.members.some.userId, userId);
  for (const name of ["list_projects", "list_members", "list_comments"]) {
    const result = await call(name, {
      workspace_id: workspace,
      ...(name === "list_comments" ? { task_id: taskId } : {}),
    });
    assert.equal(result.structuredContent.items.length, 1);
    assert.ok(!JSON.stringify(result).includes("tokenHash"));
    assert.ok(!JSON.stringify(result).includes("email"));
  }
});
test("strict input limits and unknown mutation tools prevent task reads", async () => {
  for (const args of [
    { workspace_id: workspace, limit: 51 },
    { workspace_id: workspace, limit: 0 },
    { workspace_id: workspace, unexpected: true },
    { workspace_id: "bad" },
  ]) {
    const body = await (await rpc("tools/call", { name: "list_tasks", arguments: args })).json();
    assert.ok(body.error || body.result?.isError);
  }
  const unknown = await (
    await rpc("tools/call", { name: "update_task", arguments: { workspace_id: workspace } })
  ).json();
  assert.ok(unknown.error || unknown.result?.isError);
  assert.ok(!queries.some(([name]) => name === "tasks"));
});
test("oversized results are explicit failures, never silently truncated", async () => {
  tasks = [taskRow(taskId)];
  tasks[0].title = "x".repeat(128 * 1024);
  assert.equal(
    toolError(await call("list_tasks", { workspace_id: workspace })).error,
    "mcp_result_too_large"
  );
});
test("request rate limits and Redis outages fail closed", async () => {
  rate = 121;
  const response = await rpc("tools/list");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  redisDown = true;
  const unavailable = await rpc("tools/list");
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes("secret database address"));
});
test("origins require explicit allow-list; preflight supports protocol headers without cookies", async () => {
  for (const Origin of ["https://evil.example", "null"])
    assert.equal((await rpc("tools/list", {}, { Origin })).status, 403);
  const response = await app.request("/api/mcp", {
    method: "OPTIONS",
    headers: { Origin: "https://mokara.example" },
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-headers"), /MCP-Protocol-Version/);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});
test("transport rejects oversized bodies, malformed JSON and unsupported methods", async () => {
  assert.equal((await rpc("tools/list", {}, {}, "x".repeat(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await rpc("tools/list", {}, {}, "{")).status, 400);
  for (const method of ["GET", "DELETE"])
    assert.equal(
      (
        await app.request("/api/mcp", {
          method,
          headers: { Authorization: `Bearer ${credential.token}` },
        })
      ).status,
      405
    );
});
test("issuance validates scope/expiry, returns token once, and lists metadata without hashes", async () => {
  const input = { name: "Agent", workspace_ids: [workspace], expires_in_days: 7 };
  assert.equal(
    createMcpConnectionSchema.safeParse({ ...input, workspace_ids: [workspace, workspace] })
      .success,
    false
  );
  assert.equal(
    createMcpConnectionSchema.safeParse({ ...input, expires_in_days: 91 }).success,
    false
  );
  const response = await settings.request("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(created.tokenHash, hashCredential(body.token));
  assert.equal(created.token, undefined);
  assert.equal(body.connection.tokenHash, undefined);
  assert.equal(body.connection.access, "read");
  const list = await settings.request("/connections");
  assert.equal(list.headers.get("cache-control"), "no-store");
  const metadata = await list.text();
  assert.ok(!metadata.includes(credential.tokenHash));
  assert.ok(!metadata.includes(credential.token));
});
test("foreign scope issuance is denied; revocation always includes browser user", async () => {
  member = false;
  const response = await settings.request("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Agent", workspace_ids: [other] }),
  });
  assert.equal(response.status, 403);
  assert.equal(created, null);
  assert.equal(
    (await settings.request(`/connections/${taskId}`, { method: "DELETE" })).status,
    204
  );
  assert.equal(revoked.where.userId, userId);
  assert.equal(revoked.where.id, taskId);
  assert.ok(revoked.data.revokedAt instanceof Date);
});
test("manual GitHub grants follow active repositories without a repository snapshot", async () => {
  const input = {
    name: "Agent",
    workspace_ids: [workspace],
    scopes: ["mokara:read", "mokara:github"],
  };
  const response = await settings.request("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.connection.repository_access, "active");
  assert.deepEqual(body.connection.repository_ids, []);
  assert.equal(created.repositoryIds, undefined);
  // Previously stored selections are no longer advertised as an authorization list.
  connection.scopes = input.scopes;
  connection.repositoryIds = [other];
  const list = await (await settings.request("/connections")).json();
  assert.equal(list.connections[0].repository_access, "active");
  assert.deepEqual(list.connections[0].repository_ids, []);
  const denied = await settings.request("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, scopes: ["mokara:read"], repository_ids: [other] }),
  });
  assert.equal(denied.status, 403);
});

test("unexpected infrastructure failures use safe HTTP/tool errors and safe logs", async () => {
  databaseDown = true;
  const response = await rpc("tools/list");
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("private credential value"));
  databaseDown = false;
  toolDown = true;
  const failure = toolError(await call("list_tasks", { workspace_id: workspace }));
  assert.equal(failure.error, "internal_error");
  assert.ok(!JSON.stringify(failure).includes("private task value"));
  assert.ok(!JSON.stringify(logs).includes("private"));
  assert.ok(!JSON.stringify(logs).includes(credential.token));
});
test("issuance has its own hourly quota; browser MCP responses retain CORS and notifications return 202", async () => {
  rate = 11;
  const response = await settings.request("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Agent", workspace_ids: [workspace] }),
  });
  assert.equal(response.status, 429);
  assert.equal(created, null);
  rate = 1;
  const browser = await rpc("tools/list", {}, { Origin: "https://mokara.example" });
  assert.equal(browser.status, 200);
  assert.equal(browser.headers.get("access-control-allow-origin"), "https://mokara.example");
  const initialized = await rpc(
    "notifications/initialized",
    {},
    {},
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
  );
  assert.equal(initialized.status, 202);
});

test("mDrive-read connections remain labeled read-only; upload grants are writable", async () => {
  connection.scopes = ["mokara:read", "mokara:drive:read"];
  let response = await settings.request("/connections");
  assert.equal((await response.json()).connections[0].access, "read");
  connection.scopes.push("mokara:drive:upload");
  response = await settings.request("/connections");
  assert.equal((await response.json()).connections[0].access, "write");
});
