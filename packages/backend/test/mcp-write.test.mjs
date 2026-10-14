import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { Prisma } from "@mokara/db/prisma/generated/client";
const workspace = randomUUID(),
  other = randomUUID(),
  userId = randomUUID(),
  taskId = randomUUID(),
  repositoryId = randomUUID(),
  connectionId = randomUUID();
let connection, member, eligible, operations, calls, failure, saveFailure, linked, gate;
const prisma = {
  workspaceFile: {
    findFirst: async ({ where }) =>
      where.teamId === workspace && where.id === taskId
        ? {
            id: taskId,
            name: "Image.png",
            folderId: null,
            uploadedById: userId,
            uploaderName: "Kai",
            contentType: "image/png",
            sizeBytes: 6,
            createdAt: new Date(),
            trashedAt: null,
            storageKey: "private-key",
          }
        : null,
  },
  mcpConnection: { findUnique: async () => connection },
  teamMember: { findUnique: async () => (member ? { role: "member" } : null) },
  task: {
    findFirst: async ({ where }) =>
      where.teamId === workspace && where.id === taskId ? { id: taskId } : null,
  },
  comment: { findFirst: async () => ({ id: taskId }) },
  subtaskItem: { findFirst: async () => ({ id: taskId }) },
  project: { findFirst: async () => ({ id: taskId }) },
  kpi: { findFirst: async () => ({ id: taskId }) },
  attachment: {
    findFirst: async () => ({ id: taskId }),
    findUnique: async () => ({
      sizeBytes: 6,
      filename: "report.pdf",
      contentType: "application/pdf",
      storageKey: "private-key",
    }),
  },
  gitHubIssueLink: { findUnique: async () => (linked ? { repositoryId, status: "linked" } : null) },
  gitHubRepository: {
    findMany: async () =>
      eligible ? [{ id: repositoryId, fullName: "team/repo", private: true }] : [],
  },
  mcpOperation: {
    findUnique: async ({ where }) =>
      operations.get(
        `${where.connectionId_requestId.connectionId}:${where.connectionId_requestId.requestId}`
      ) ?? null,
    create: async ({ data }) => {
      const key = `${data.connectionId}:${data.requestId}`;
      if (operations.has(key))
        throw new Prisma.PrismaClientKnownRequestError(
          "mcp_operations_connection_id_request_id_key",
          { code: "P2002", clientVersion: "test" }
        );
      const row = {
        ...data,
        id: randomUUID(),
        status: "pending",
        result: null,
        createdAt: new Date(),
        finishedAt: null,
      };
      operations.set(key, row);
      return row;
    },
    update: async ({ where, data }) => {
      if (saveFailure) throw Error("private database values");
      const row = [...operations.values()].find((row) => row.id === where.id);
      Object.assign(row, data);
      return row;
    },
    findMany: async () => [...operations.values()],
  },
};
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/env.ts", {
  namedExports: {
    env: { AUTH_SECRET: "test-secret", MCP_ALLOWED_ORIGINS: "" },
    githubConfigured: false,
  },
});
mock.module("../src/redis.ts", {
  namedExports: { getRedis: () => ({ eval: async () => [1, 60] }) },
});
mock.module("../src/lib/logger.ts", {
  namedExports: { log: { info() {}, warn() {}, error() {} } },
});
const { McpFailure } = await import("../src/mcp/errors.ts");
mock.module("../src/mcp/internal-api.ts", {
  namedExports: {
    domainResponse: async () => new Response(null, { status: 204 }),
    domainJson: async (_principal, path, method = "GET", body) => {
      calls.push({ path, method, body });
      if (gate && method === "POST" && path.endsWith("/tasks")) await gate();
      if (failure && (failure.path === undefined || path.endsWith(failure.path)))
        throw failure.error;
      if (path.endsWith("/github-issue"))
        return {
          github_issue: {
            issue_number: 42,
            issue_url: "https://github.com/test/repo/issues/42",
            status: "linked",
          },
        };
      return { id: taskId, ...body };
    },
  },
});
mock.module("../src/lib/storage.ts", {
  namedExports: {
    getObjectChunk: async (_key, offset, length) =>
      new Uint8Array(Buffer.from("abcdef").subarray(offset, offset + length)),
  },
});
const { mcpRoutes } = await import("../src/mcp/routes.ts");
const { newCredential } = await import("../src/mcp/access.ts");
const credential = newCredential();
const app = new Hono();
app.route("/api/mcp", mcpRoutes);
beforeEach(() => {
  member = eligible = true;
  operations = new Map();
  calls = [];
  failure = null;
  saveFailure = linked = false;
  gate = null;
  connection = {
    id: connectionId,
    userId,
    workspaceIds: [workspace],
    scopes: ["mokara:read", "mokara:write", "mokara:delete", "mokara:github"],
    repositoryIds: [repositoryId],
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  };
});
async function rpc(method, params = {}) {
  const response = await app.request("/api/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function tool(name, args) {
  const body = await rpc("tools/call", { name, arguments: args });
  return body.result ?? { isError: true, content: [{ text: JSON.stringify(body.error) }] };
}
const createInput = () => ({
  workspace_id: workspace,
  request_id: randomUUID(),
  data: { title: "testing", status: "todo", priority: "medium" },
});
const errorCode = (result) => JSON.parse(result.content[0].text).error;

test("full grants expose task workflows but never account, billing, admin or generic REST tools", async () => {
  const tools = (await rpc("tools/list")).result.tools;
  const names = tools.map((tool) => tool.name);
  for (const name of [
    "create_task",
    "update_task",
    "delete_task",
    "add_step",
    "add_comment",
    "create_project",
    "create_kpi",
    "set_task_kpis",
    "upload_attachment",
    "read_attachment",
    "list_github_repositories",
    "list_github_issues",
    "get_github_issue",
    "link_github_issue",
    "publish_github_issue",
    "list_operations",
  ])
    assert.ok(names.includes(name), name);
  assert.ok(!names.some((name) => /billing|admin|password|api_request/.test(name)));
  assert.equal(tools.find((tool) => tool.name === "create_task").annotations.readOnlyHint, false);
  assert.equal(tools.find((tool) => tool.name === "delete_task").annotations.destructiveHint, true);
  assert.equal(
    tools.find((tool) => tool.name === "list_github_issues").annotations.readOnlyHint,
    true
  );
});
test("read-only grants cannot discover or invoke writes and deleting needs its separate permission", async () => {
  connection.scopes = ["mokara:read"];
  assert.ok(!(await rpc("tools/list")).result.tools.some((tool) => tool.name === "create_task"));
  assert.equal((await tool("create_task", createInput())).isError, true);
  assert.equal(calls.length, 0);
  connection.scopes.push("mokara:write");
  assert.equal(
    (
      await tool("delete_task", {
        workspace_id: workspace,
        item_id: taskId,
        request_id: randomUUID(),
        confirm: true,
      })
    ).isError,
    true
  );
  assert.equal(calls.length, 0);
});
test("task creation forwards all task fields, steps and selected GitHub publishing once", async () => {
  const input = {
    ...createInput(),
    data: {
      title: "testing",
      description: "Description",
      due_date: "2026-12-31",
      priority: "high",
      assignee_id: userId,
      project_id: taskId,
      kpis: [{ kpi_id: taskId, weight: 50 }],
    },
    steps: ["Step one", "Step two"],
    github_repository_id: repositoryId,
  };
  const response = await tool("create_task", input);
  assert.ok(!response.isError, JSON.stringify(response));
  assert.equal(response.structuredContent.task_id, taskId);
  assert.equal(response.structuredContent.completion.github_issue, "published");
  assert.equal(response.structuredContent.github_issue.issue_number, 42);
  assert.deepEqual(response.structuredContent.follow_up_errors, []);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].body.assignee_id, userId);
  assert.equal(calls[0].body.kpis[0].weight, 50);
  const replay = await tool("create_task", input);
  assert.equal(replay.structuredContent.replayed, true);
  assert.equal(calls.length, 4);
  assert.equal(operations.size, 1);
});
test("idempotency keys cannot be reused for different input, operations or workspaces", async () => {
  const input = createInput();
  await tool("create_task", input);
  assert.equal(
    errorCode(await tool("create_task", { ...input, data: { title: "Different" } })),
    "mcp_request_conflict"
  );
  assert.equal(calls.length, 1);
  assert.equal(
    errorCode(await tool("create_task", { ...input, workspace_id: other })),
    "mcp_workspace_forbidden"
  );
});
test("concurrent matching requests reserve once and report an in-flight retry", async () => {
  let release, started;
  const running = new Promise((resolve) => {
    started = resolve;
  });
  gate = () =>
    new Promise((resolve) => {
      release = resolve;
      started();
    });
  const input = createInput();
  const first = tool("create_task", input);
  await running;
  const second = await tool("create_task", input);
  assert.equal(errorCode(second), "mcp_operation_pending");
  release();
  assert.ok(!(await first).isError);
  assert.equal(calls.length, 1);
});
test("uncertain post-write persistence never performs a duplicate and keeps pending activity", async () => {
  saveFailure = true;
  const input = createInput();
  assert.equal((await tool("create_task", input)).isError, true);
  assert.equal(calls.length, 1);
  saveFailure = false;
  assert.equal(errorCode(await tool("create_task", input)), "mcp_operation_pending");
  assert.equal(calls.length, 1);
  assert.equal([...operations.values()][0].status, "pending");
});
test("membership is checked before replaying results; foreign task IDs never reach domain routes", async () => {
  const input = createInput();
  await tool("create_task", input);
  member = false;
  assert.equal(errorCode(await tool("create_task", input)), "mcp_workspace_forbidden");
  member = true;
  const count = calls.length;
  assert.equal(
    errorCode(
      await tool("update_task", {
        workspace_id: workspace,
        request_id: randomUUID(),
        item_id: other,
        data: { title: "No" },
      })
    ),
    "not_found"
  );
  assert.equal(calls.length, count);
});
test("GitHub requires both permission and the approved currently enabled repository", async () => {
  connection.scopes = ["mokara:read", "mokara:write"];
  assert.equal(
    errorCode(await tool("create_task", { ...createInput(), github_repository_id: repositoryId })),
    "mcp_scope_forbidden"
  );
  assert.equal(calls.length, 0);
  connection.scopes.push("mokara:github");
  eligible = false;
  assert.equal(
    errorCode(await tool("create_task", { ...createInput(), github_repository_id: repositoryId })),
    "mcp_repository_forbidden"
  );
  assert.equal(calls.length, 0);
});
test("GitHub publishing failure reports the created task and replays without recreating it", async () => {
  failure = {
    path: "/github-issue",
    error: new McpFailure("github_unavailable", "Publishing unavailable.", 503),
  };
  const input = { ...createInput(), github_repository_id: repositoryId };
  const result = await tool("create_task", input);
  assert.equal(result.structuredContent.task_id, taskId);
  assert.equal(result.structuredContent.completion.github_issue, "failed_or_uncertain");
  assert.equal(result.structuredContent.github_issue, null);
  assert.equal(result.structuredContent.follow_up_errors[0].error, "github_unavailable");
  assert.equal(calls.length, 2);
  await tool("create_task", input);
  assert.equal(calls.length, 2);
});
test("changing a linked task's status cannot bypass GitHub repository permission", async () => {
  linked = true;
  connection.scopes = ["mokara:read", "mokara:write"];
  const input = {
    workspace_id: workspace,
    request_id: randomUUID(),
    item_id: taskId,
    data: { status: "done" },
  };
  assert.equal(errorCode(await tool("update_task", input)), "mcp_scope_forbidden");
  assert.equal(calls.length, 0);
  assert.ok(
    !(
      await tool("update_task", {
        ...input,
        request_id: randomUUID(),
        data: { title: "Allowed local change" },
      })
    ).isError
  );
});
test("ownership denials are preserved, recorded and cannot be retried as a fresh mutation", async () => {
  failure = { error: new McpFailure("forbidden", "You can only edit your own comments.", 403) };
  const input = {
    workspace_id: workspace,
    request_id: randomUUID(),
    item_id: taskId,
    data: { body: "Edit" },
  };
  assert.equal(errorCode(await tool("update_comment", input)), "forbidden");
  assert.equal([...operations.values()][0].status, "failed");
  await tool("update_comment", input);
  assert.equal(calls.length, 1);
});
test("deletion requires a true confirmation field and is idempotent with that request UUID", async () => {
  const input = { workspace_id: workspace, request_id: randomUUID(), item_id: taskId };
  assert.equal((await tool("delete_task", input)).isError, true);
  assert.equal(calls.length, 0);
  assert.ok(!(await tool("delete_task", { ...input, confirm: true })).isError);
  await tool("delete_task", { ...input, confirm: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "DELETE");
});

test("attachment reads use bounded chunks, hide storage keys and enforce membership", async () => {
  const args = { workspace_id: workspace, attachment_id: taskId, limit: 4 };
  const first = await tool("read_attachment", args);
  assert.equal(first.isError, undefined);
  const data = JSON.parse(first.content[0].text);
  assert.equal(Buffer.from(data.data, "base64").toString(), "abcd");
  assert.equal(data.next_offset, 4);
  assert.ok(!JSON.stringify(first).includes("private-key"));
  const last = JSON.parse((await tool("read_attachment", { ...args, offset: 4 })).content[0].text);
  assert.equal(Buffer.from(last.data, "base64").toString(), "ef");
  assert.equal(last.next_offset, null);
  assert.equal((await tool("read_attachment", { ...args, offset: 6 })).isError, true);
  member = false;
  assert.equal((await tool("read_attachment", args)).isError, true);
});
test("attachment upload passes a typed file through domain quotas and is replay safe", async () => {
  const args = {
    workspace_id: workspace,
    task_id: taskId,
    request_id: randomUUID(),
    filename: "report.pdf",
    content_type: "application/pdf",
    data_base64: Buffer.from("file").toString("base64"),
  };
  assert.equal((await tool("upload_attachment", args)).isError, undefined);
  assert.equal(calls.length, 1);
  const file = calls[0].body.get("file");
  assert.equal(file.name, "report.pdf");
  assert.equal(await file.text(), "file");
  await tool("upload_attachment", args);
  assert.equal(calls.length, 1);
  assert.equal(
    (await tool("upload_attachment", { ...args, request_id: randomUUID(), data_base64: "" }))
      .isError,
    true
  );
  assert.equal(calls.length, 1);
});

test("local task creation explicitly reports no GitHub request and performs no publication", async () => {
  const result = await tool("create_task", createInput());
  assert.equal(result.structuredContent.completion.github_issue, "not_requested");
  assert.equal(result.structuredContent.github_issue, null);
  assert.equal(calls.length, 1);
});
test("workflow prompts are permission filtered and render without any side effects", async () => {
  const all = (await rpc("prompts/list")).result.prompts.map((prompt) => prompt.name);
  assert.deepEqual(all.sort(), [
    "create_task_with_github_issue",
    "publish_existing_task_to_github",
  ]);
  const rendered = await rpc("prompts/get", {
    name: "create_task_with_github_issue",
    arguments: { title: "testing", repository: "test/repo", workspace: "Personal" },
  });
  assert.ok(rendered.result.messages[0].content.text.includes('"repository":"test/repo"'));
  assert.equal(calls.length, 0);
  assert.equal(operations.size, 0);
  connection.scopes = ["mokara:read", "mokara:github"];
  assert.deepEqual(
    (await rpc("prompts/list")).result.prompts.map((prompt) => prompt.name),
    ["publish_existing_task_to_github"]
  );
  connection.scopes = ["mokara:read"];
  assert.equal((await rpc("prompts/list")).error.code, -32601);
});
test("publishing for an existing task never creates a replacement task", async () => {
  const result = await tool("publish_github_issue", {
    workspace_id: workspace,
    task_id: taskId,
    repository_id: repositoryId,
    request_id: randomUUID(),
  });
  assert.equal(result.structuredContent.github_issue.issue_number, 42);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `/tasks/${taskId}/github-issue`);
});

test("mDrive tools require explicit scopes and return native MCP image content", async () => {
  let names = (await rpc("tools/list")).result.tools.map((t) => t.name);
  assert.equal(names.includes("read_drive_file"), false);
  connection.scopes.push("mokara:drive:read", "mokara:drive:upload");
  const listed = (await rpc("tools/list")).result.tools;
  assert.equal(
    listed.filter((t) =>
      [
        "list_drive_items",
        "search_drive_items",
        "get_drive_file",
        "read_drive_file",
        "create_drive_folder",
        "upload_drive_file",
      ].includes(t.name)
    ).length,
    6
  );
  assert.equal(listed.find((t) => t.name === "read_drive_file").annotations.readOnlyHint, true);
  assert.equal(listed.find((t) => t.name === "upload_drive_file").annotations.readOnlyHint, false);
  const result = await tool("read_drive_file", { workspace_id: workspace, file_id: taskId });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[1].type, "image");
  assert.equal(result.content[1].mimeType, "image/png");
  assert.equal(result.content[1].data, Buffer.from("abcdef").toString("base64"));
  assert.equal(result.structuredContent.image, undefined);
  assert.equal(JSON.stringify(result).includes("private-key"), false);
});
