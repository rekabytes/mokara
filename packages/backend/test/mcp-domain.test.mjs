import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
const userId = randomUUID(),
  teamId = randomUUID(),
  taskId = randomUUID(),
  commentId = randomUUID(),
  otherId = randomUUID();
let member, author, writes;
const date = new Date();
const prisma = {
  user: { findUnique: async () => ({ username: "actor" }) },
  teamMember: { findUnique: async () => (member ? { role: "member" } : null) },
  task: { findUnique: async () => ({ id: taskId, teamId, title: "Task" }) },
  comment: {
    findUnique: async () => ({ authorId: author, taskId, task: { teamId } }),
    create: async ({ data }) => {
      writes.push(data);
      return {
        id: commentId,
        ...data,
        parentId: null,
        author: { id: userId, username: "actor", displayName: null, createdAt: date },
        createdAt: date,
        updatedAt: date,
        attachments: [],
      };
    },
    update: async () => {
      writes.push("unexpected update");
    },
  },
};
mock.module("../src/env.ts", {
  namedExports: { env: { AUTH_PUBLIC_URL: "", ENV: "development" } },
});
mock.module("../src/db.ts", { namedExports: { prisma } });
mock.module("../src/lib/notifications.ts", { namedExports: { notify: async () => {} } });
mock.module("../src/routes/attachments.ts", {
  namedExports: { attachmentRoutes: new Hono(), purgeAttachmentObjects: async () => {} },
});
for (const [file, name] of [
  ["tasks", "taskRoutes"],
  ["subtasks", "subtaskRoutes"],
  ["projects", "projectRoutes"],
  ["kpis", "kpiRoutes"],
  ["github", "githubRoutes"],
  ["analytics", "analyticsRoutes"],
])
  mock.module(`../src/routes/${file}.ts`, { namedExports: { [name]: new Hono() } });
const { domainJson } = await import("../src/mcp/internal-api.ts");
const principal = {
  connectionId: randomUUID(),
  userId,
  workspaceIds: [teamId],
  scopes: ["mokara:read", "mokara:write"],
};
beforeEach(() => {
  member = true;
  author = otherId;
  writes = [];
});
test("in-process MCP operations execute the real comment route with the authenticated actor", async () => {
  const response = await domainJson(principal, `/tasks/${taskId}/comments`, "POST", {
    body: "Comment",
    author_id: otherId,
  });
  assert.equal(response.comment.author.id, userId);
  assert.equal(writes[0].authorId, userId);
  assert.equal(writes[0].body, "Comment");
});
test("real domain membership and comment ownership checks remain authoritative", async () => {
  member = false;
  await assert.rejects(
    () => domainJson(principal, `/tasks/${taskId}/comments`, "POST", { body: "Denied" }),
    (error) => error.code === "forbidden"
  );
  assert.equal(writes.length, 0);
  member = true;
  await assert.rejects(
    () => domainJson(principal, `/comments/${commentId}`, "PATCH", { body: "Denied edit" }),
    (error) => error.code === "forbidden"
  );
  assert.equal(writes.length, 0);
});
