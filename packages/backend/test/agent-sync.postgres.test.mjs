import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID, createHmac } from "node:crypto";
const url = process.env.AGENT_SYNC_TEST_DATABASE_URL;
if (!url) {
  test(
    "agent execution PostgreSQL integration requires AGENT_SYNC_TEST_DATABASE_URL",
    { skip: true },
    () => {}
  );
} else {
  // Never point this fixture writer at the application's configured database.
  if (!new URL(url).pathname.includes("agent_qa")) throw Error("Use a dedicated agent_qa database");
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET = "agent-qa-only-secret-not-a-production-credential-123";
  process.env.ENV = "development";
  mock.module("../src/redis.ts", {
    namedExports: { getRedis: () => ({ eval: async () => [1, 60] }) },
  });
  const { prisma: db } = await import("../src/db.ts");
  const {
    agentCommand,
    agentTask,
    agentTaskSnapshot,
    agentChanges,
    agentHistory,
    agentSnapshot,
    readyAgentTasks,
    expireAgentLeases,
  } = await import("../src/lib/agent-sync.ts");
  const { isUniqueViolation, dbErrorInfo } = await import("../src/lib/db-error.ts");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@mokara/db/prisma/generated/client");
  const { Hono } = await import("hono");
  const { mcpRoutes } = await import("../src/mcp/routes.ts");
  const { agentSyncRoutes } = await import("../src/routes/agent-sync.ts");
  const { newCredential } = await import("../src/mcp/access.ts");
  const token = newCredential();
  const second = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const user = randomUUID(),
    workspace = randomUUID(),
    otherWorkspace = randomUUID(),
    installation = randomUUID();
  const scopes = ["mokara:read", "mokara:agent:manage", "mokara:agent:execute"];
  const credential = async (name) =>
    db.mcpConnection.create({
      data: {
        userId: user,
        name,
        tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        workspaceIds: [workspace],
        scopes,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  let connection, connection2, actor;
  const human = { kind: "user", userId: user };
  const makeTask = async (data = {}) =>
    db.task.create({ data: { teamId: workspace, title: "Research Docker", ...data } });
  const fields = (task) => ({
    workspace_id: workspace,
    task_id: task.id,
    request_id: randomUUID(),
  });
  const ready = async (task) => {
    const t = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    return agentCommand(human, {
      ...fields(t),
      action: "readiness",
      expected_revision: t.agentRevision.toString(),
      ready: true,
    });
  };
  const claimInput = async (task) => {
    const t = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    return {
      ...fields(t),
      action: "claim",
      expected_revision: t.agentRevision.toString(),
      client_id: "external-client",
      installation_id: installation,
      lease_seconds: 120,
    };
  };
  const claim = async (task) => agentCommand(actor, await claimInput(task));
  const owned = (task, execution) => ({
    ...fields(task),
    installation_id: installation,
    execution_id: execution.id,
  });
  const error = (code) => (e) => e.code === code;
  await test("agent execution on real PostgreSQL transactions", async (t) => {
    await db.user.create({
      data: { id: user, username: `agentqa_${user.slice(0, 8)}`, passwordHash: "not-used" },
    });
    await db.team.create({
      data: {
        id: workspace,
        name: "Agent QA",
        slug: `agent-qa-${workspace}`,
        ownerId: user,
        members: { create: { userId: user, role: "owner" } },
      },
    });
    await db.team.create({
      data: {
        id: otherWorkspace,
        name: "Other",
        slug: `agent-qa-${otherWorkspace}`,
        ownerId: user,
      },
    });
    connection = await credential("Client one");
    connection2 = await credential("Client two");
    actor = {
      kind: "connection",
      principal: { connectionId: connection.id, userId: user, workspaceIds: [workspace], scopes },
    };
    try {
      await t.test(
        "defaults are not ready; normal edits and status changes cannot authorize work",
        async () => {
          const task = await makeTask();
          assert.equal(task.agentReady, false);
          assert.equal((await agentTask(actor, workspace, task.id)).ready, false);
          await assert.rejects(() => claim(task), error("agent_task_not_ready"));
          await db.task.update({
            where: { id: task.id },
            data: { status: "in_progress", description: "A broad instruction is enough" },
          });
          assert.equal((await agentTask(actor, workspace, task.id)).ready, false);
          await ready(task);
          assert.equal(
            (await readyAgentTasks(actor, { workspace_id: workspace, limit: 50 })).items.some(
              (x) => x.id === task.id
            ),
            true
          );
        }
      );
      await t.test(
        "simultaneous requests from separate database connections yield exactly one claim",
        async () => {
          const task = await makeTask();
          await ready(task);
          const input = await claimInput(task);
          const other = { ...input, request_id: randomUUID(), installation_id: randomUUID() };
          const outcomes = await Promise.all([
            db.$queryRaw`SELECT agent_sync_command(${user}::uuid,${connection.id}::uuid,'claim',${JSON.stringify(input)}::jsonb) AS data`,
            second.$queryRaw`SELECT agent_sync_command(${user}::uuid,${connection2.id}::uuid,'claim',${JSON.stringify(other)}::jsonb) AS data`,
          ]);
          assert.equal(outcomes.filter((x) => x[0].data.execution).length, 1);
          assert.equal(await db.agentExecution.count({ where: { taskId: task.id } }), 1);
          assert.ok(
            ["agent_revision_conflict", "agent_already_claimed"].includes(
              outcomes.find((x) => x[0].data.error)[0].data.error
            )
          );
          assert.equal(
            await db.agentSyncRequest.count({
              where: { requestId: { in: [input.request_id, other.request_id] } },
            }),
            2
          );
        }
      );
      await t.test(
        "identical retries are transactional, including simultaneous retries; payload conflicts fail",
        async () => {
          const task = await makeTask();
          await ready(task);
          const input = await claimInput(task);
          const [a, b] = await Promise.all([
            agentCommand(actor, input),
            agentCommand(actor, input),
          ]);
          assert.deepEqual(a, b);
          assert.equal(await db.agentExecution.count({ where: { taskId: task.id } }), 1);
          await assert.rejects(
            () => agentCommand(actor, { ...input, lease_seconds: 300 }),
            error("agent_idempotency_conflict")
          );
          const saved = await db.agentSyncRequest.findFirstOrThrow({
            where: { requestId: input.request_id },
          });
          assert.deepEqual(saved.result, a);
        }
      );
      await t.test(
        "revision conflicts preserve edits; accepted instructions remain immutable",
        async () => {
          const task = await makeTask({ description: "Original instructions" });
          await ready(task);
          const input = await claimInput(task);
          await db.task.update({
            where: { id: task.id },
            data: { description: "Changed before claim" },
          });
          await assert.rejects(() => agentCommand(actor, input), error("agent_revision_conflict"));
          const { execution } = await claim(task);
          assert.equal((await agentTask(actor, workspace, task.id)).new_information, false);
          await db.task.update({
            where: { id: task.id },
            data: { description: "Changed during claim" },
          });
          const detail = await agentTask(actor, workspace, task.id);
          assert.equal(detail.new_information, true);
          assert.equal(detail.task.description, "Changed during claim");
          const snapshot = await agentSnapshot(actor, {
            workspace_id: workspace,
            task_id: task.id,
            execution_id: execution.id,
            offset: 0,
            limit: 16000,
          });
          assert.equal(JSON.parse(snapshot.text).description, "Changed before claim");
          const before = BigInt(detail.revision);
          await db.subtaskItem.create({
            data: { taskId: task.id, title: "New step", position: 0 },
          });
          assert.ok(BigInt((await agentTask(actor, workspace, task.id)).revision) > before);
        }
      );
      await t.test(
        "current instructions and attachment metadata are readable before claiming in revision-checked chunks",
        async () => {
          const task = await makeTask({
            description: "Broad instructions " + "text ".repeat(5000),
          });
          const comment = await db.comment.create({
            data: { taskId: task.id, authorId: user, body: "Context" },
          });
          const attachment = await db.attachment.create({
            data: {
              commentId: comment.id,
              teamId: workspace,
              uploaderId: user,
              filename: "context.png",
              sizeBytes: 30,
              contentType: "image/png",
              storageKey: "qa-not-a-real-object-" + randomUUID(),
            },
          });
          const detail = await agentTask(actor, workspace, task.id, false);
          assert.equal(detail.ready, false);
          assert.equal(detail.task.description, undefined);
          const input = {
            workspace_id: workspace,
            task_id: task.id,
            expected_revision: detail.revision,
            offset: 0,
            limit: 1000,
          };
          let text = "",
            offset = 0;
          while (offset !== null) {
            const part = await agentTaskSnapshot(actor, { ...input, offset });
            text += part.text;
            offset = part.next_offset;
          }
          const parsed = JSON.parse(text);
          assert.equal(parsed.description, task.description);
          assert.ok(
            parsed.attachments.some((a) => a.id === attachment.id && a.comment_id === comment.id)
          );
          assert.ok(!text.includes("storage_key"));
          await db.task.update({ where: { id: task.id }, data: { description: "Changed" } });
          await assert.rejects(
            () => agentTaskSnapshot(actor, input),
            error("agent_revision_conflict")
          );
        }
      );
      await t.test(
        "connection and installation ownership protect lease, progress and completion",
        async () => {
          const task = await makeTask();
          await ready(task);
          const { execution } = await claim(task);
          const input = owned(task, execution);
          const other = {
            kind: "connection",
            principal: { ...actor.principal, connectionId: connection2.id },
          };
          await assert.rejects(
            () => agentCommand(other, { ...input, action: "start" }),
            error("agent_claim_lost")
          );
          await assert.rejects(
            () =>
              agentCommand(actor, {
                ...owned(task, execution),
                installation_id: randomUUID(),
                action: "start",
              }),
            error("agent_claim_lost")
          );
          const started = await agentCommand(actor, { ...owned(task, execution), action: "start" });
          assert.equal(started.execution.state, "running");
          const renewed = await agentCommand(actor, {
            ...owned(task, execution),
            action: "renew",
            lease_seconds: 300,
          });
          assert.ok(
            new Date(renewed.execution.lease_expires_at) > new Date(execution.lease_expires_at)
          );
          await agentCommand(actor, {
            ...owned(task, execution),
            action: "progress",
            message: "Reading docs",
            percent: 20,
          });
          const completeInput = {
            ...owned(task, execution),
            action: "finish",
            result: "Docker findings",
          };
          const result = await agentCommand(actor, completeInput);
          assert.deepEqual(await agentCommand(actor, completeInput), result);
          assert.equal(
            (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status,
            "todo"
          );
          await db.task.update({
            where: { id: task.id },
            data: { description: "Edited after finish" },
          });
          assert.equal((await agentTask(actor, workspace, task.id)).ready, false);
          await assert.rejects(() => claim(task), error("agent_task_not_ready"));
          const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
          await agentCommand(human, {
            ...fields(task),
            action: "requeue",
            expected_revision: current.agentRevision.toString(),
          });
          assert.notEqual((await claim(task)).execution.id, execution.id);
        }
      );
      await t.test(
        "expiry becomes unknown, blocks reclaim and rejects stale owners until explicit recovery",
        async () => {
          const task = await makeTask();
          await ready(task);
          const { execution } = await claim(task);
          await db.$executeRaw`UPDATE agent_executions SET claimed_at=clock_timestamp()-interval '5 minutes',lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=${execution.id}::uuid`;
          await expireAgentLeases();
          assert.equal((await agentTask(actor, workspace, task.id)).execution.state, "unknown");
          await assert.rejects(
            () =>
              agentCommand(actor, {
                ...owned(task, execution),
                action: "renew",
                lease_seconds: 120,
              }),
            error("agent_lease_expired")
          );
          await assert.rejects(
            () => claim(task),
            (e) => ["agent_already_claimed", "agent_task_not_ready"].includes(e.code)
          );
          await assert.rejects(() => ready(task), error("agent_already_claimed"));
          const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
          await agentCommand(human, {
            ...fields(task),
            action: "requeue",
            expected_revision: current.agentRevision.toString(),
          });
          assert.equal(
            (await db.agentExecution.findUniqueOrThrow({ where: { id: execution.id } })).state,
            "abandoned"
          );
          assert.notEqual((await claim(task)).execution.id, execution.id);
        }
      );
      await t.test(
        "cancellation is requested until acknowledged; withdrawal and pause never stop processes",
        async () => {
          const task = await makeTask();
          await ready(task);
          const { execution } = await claim(task);
          await agentCommand(actor, { ...owned(task, execution), action: "start" });
          const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
          await agentCommand(human, {
            ...fields(task),
            action: "readiness",
            ready: false,
            expected_revision: current.agentRevision.toString(),
          });
          assert.equal((await agentTask(actor, workspace, task.id)).execution.state, "running");
          const refreshed = await db.task.findUniqueOrThrow({ where: { id: task.id } });
          await agentCommand(human, {
            ...fields(task),
            action: "pause",
            paused: true,
            expected_revision: refreshed.agentRevision.toString(),
          });
          assert.equal((await agentTask(actor, workspace, task.id)).execution.state, "running");
          await agentCommand(human, { ...fields(task), action: "cancel" });
          assert.equal(
            (await agentTask(actor, workspace, task.id)).execution.state,
            "cancel_requested"
          );
          const ack = await agentCommand(actor, {
            ...owned(task, execution),
            action: "cancel_ack",
          });
          assert.equal(ack.execution.state, "cancelled");
        }
      );
      await t.test(
        "task deletion retains execution history internally and requests cancellation without exposing contents",
        async () => {
          const task = await makeTask({ description: "Private instructions" });
          await ready(task);
          const { execution } = await claim(task);
          await db.task.delete({ where: { id: task.id } });
          const run = await db.agentExecution.findUniqueOrThrow({ where: { id: execution.id } });
          assert.equal(run.state, "cancel_requested");
          assert.equal(run.taskDeleted, true);
          await assert.rejects(() => agentTask(actor, workspace, task.id), error("not_found"));
          await assert.rejects(
            () => agentHistory(actor, { workspace_id: workspace, task_id: task.id, limit: 10 }),
            error("not_found")
          );
          assert.equal(
            (await agentCommand(actor, { ...owned(task, execution), action: "cancel_ack" }))
              .execution.state,
            "cancelled"
          );
        }
      );
      await t.test(
        "scope, revoked grants, workspace membership and project filters are rechecked",
        async () => {
          const task = await makeTask();
          await ready(task);
          const input = await claimInput(task);
          const readonly = {
            kind: "connection",
            principal: { ...actor.principal, scopes: ["mokara:read"] },
          };
          await assert.rejects(() => agentCommand(readonly, input), error("mcp_scope_forbidden"));
          await assert.rejects(() => agentCommand(human, input), error("agent_permission_denied"));
          await assert.rejects(
            () => agentTask(actor, otherWorkspace, task.id),
            error("agent_permission_denied")
          );
          await assert.rejects(
            () =>
              readyAgentTasks(actor, {
                workspace_id: workspace,
                project_id: randomUUID(),
                limit: 10,
              }),
            error("agent_permission_denied")
          );
          await db.mcpConnection.update({
            where: { id: connection.id },
            data: { revokedAt: new Date() },
          });
          await assert.rejects(() => agentCommand(actor, input), error("agent_permission_denied"));
          await db.mcpConnection.update({
            where: { id: connection.id },
            data: { revokedAt: null },
          });
        }
      );
      await t.test(
        "feed ordering, equal timestamps, opaque cursors, restart recovery and tombstones",
        async () => {
          const task = await makeTask();
          await ready(task);
          const { execution } = await claim(task);
          await agentCommand(actor, { ...owned(task, execution), action: "start" });
          await agentCommand(actor, {
            ...owned(task, execution),
            action: "progress",
            message: "Working",
            percent: 30,
          });
          await db.task.delete({ where: { id: task.id } });
          await db.$executeRaw`UPDATE agent_sync_events SET occurred_at='2026-10-29T00:00:00Z'::timestamptz WHERE workspace_id=${workspace}::uuid`;
          let cursor;
          const all = [];
          for (let i = 0; i < 100; i++) {
            const page = await agentChanges(actor, { workspace_id: workspace, limit: 3, cursor });
            all.push(...page.items);
            cursor = page.next_cursor;
            if (!page.has_more) break;
          }
          assert.equal(new Set(all.map((e) => e.sequence)).size, all.length);
          assert.deepEqual(
            all.map((e) => BigInt(e.sequence)),
            all.map((e) => BigInt(e.sequence)).sort((a, b) => (a < b ? -1 : 1))
          );
          assert.ok(all.some((e) => e.task_id === task.id && e.kind === "task_deleted"));
          assert.ok(all.some((e) => e.execution_id === execution.id && e.own_update));
          assert.ok(!JSON.stringify(all).includes("Private instructions"));
          assert.deepEqual(
            (await agentChanges(actor, { workspace_id: workspace, limit: 3, cursor })).items,
            []
          );
          await assert.rejects(
            () => agentChanges(actor, { workspace_id: workspace, limit: 3, cursor: cursor + "x" }),
            error("agent_cursor_invalid")
          );
          await db.teamMember.delete({
            where: { teamId_userId: { teamId: workspace, userId: user } },
          });
          await assert.rejects(
            () => agentChanges(actor, { workspace_id: workspace, limit: 3, cursor }),
            error("agent_permission_denied")
          );
          await db.teamMember.create({ data: { teamId: workspace, userId: user, role: "owner" } });
        }
      );
      await t.test(
        "failure and release preserve history and require explicit authorization",
        async () => {
          const task = await makeTask();
          await ready(task);
          const { execution } = await claim(task);
          assert.equal(
            (
              await agentCommand(actor, {
                ...owned(task, execution),
                action: "fail",
                failure: "Source unavailable",
              })
            ).execution.state,
            "failed"
          );
          await assert.rejects(() => claim(task), error("agent_task_not_ready"));
          await ready(task);
          const next = await claim(task);
          assert.equal(
            (await agentCommand(actor, { ...owned(task, next.execution), action: "release" }))
              .execution.state,
            "cancelled"
          );
          await ready(task);
          const third = await claim(task);
          await agentCommand(actor, { ...owned(task, third.execution), action: "start" });
          assert.equal(
            (await agentCommand(actor, { ...owned(task, third.execution), action: "release" }))
              .execution.state,
            "unknown"
          );
          const page = await agentHistory(actor, {
            workspace_id: workspace,
            task_id: task.id,
            limit: 1,
          });
          const secondPage = await agentHistory(actor, {
            workspace_id: workspace,
            task_id: task.id,
            limit: 1,
            cursor: page.next_cursor,
          });
          assert.notEqual(page.items[0].id, secondPage.items[0].id);
          assert.ok(new Date(page.items[0].claimed_at) >= new Date(secondPage.items[0].claimed_at));
        }
      );
      await t.test(
        "archive requests cancellation and emits events; restore never authorizes work",
        async () => {
          const project = await db.project.create({
            data: { teamId: workspace, ownerId: user, name: "Archive QA" },
          });
          const task = await makeTask({ projectId: project.id });
          await ready(task);
          const { execution } = await claim(task);
          await agentCommand(actor, { ...owned(task, execution), action: "start" });
          await db.project.update({ where: { id: project.id }, data: { archived: true } });
          const detail = await agentTask(actor, workspace, task.id);
          assert.equal(detail.ready, false);
          assert.equal(detail.paused, true);
          assert.equal(detail.execution.state, "cancel_requested");
          await agentCommand(actor, { ...owned(task, execution), action: "cancel_ack" });
          await assert.rejects(() => ready(task), error("agent_invalid_transition"));
          await db.project.update({ where: { id: project.id }, data: { archived: false } });
          assert.equal((await agentTask(actor, workspace, task.id)).ready, false);
          const events = await db.agentSyncEvent.findMany({ where: { taskId: task.id } });
          assert.ok(events.some((x) => x.kind === "task_archived"));
          assert.ok(events.some((x) => x.kind === "task_restored"));
        }
      );
      await t.test("the database itself rejects a second active owner", async () => {
        const task = await makeTask();
        await ready(task);
        const { execution } = await claim(task);
        await assert.rejects(
          () =>
            db.$executeRaw`INSERT INTO agent_executions(task_id,workspace_id,agent_name,state,accepted_revision,accepted_content_revision,snapshot,lease_expires_at) VALUES(${task.id}::uuid,${workspace}::uuid,'Other','claimed',1,1,'{}',clock_timestamp()+interval '2 minutes')`,
          (e) => isUniqueViolation(e, "agent_execution_one_owner")
        );
        assert.equal(await db.agentExecution.count({ where: { taskId: task.id } }), 1);
        assert.equal((await agentTask(actor, workspace, task.id)).execution.id, execution.id);
      });
      await t.test(
        "authorization holds membership through commit and denies access after removal",
        async () => {
          await db.$transaction(async (tx) => {
            const [row] =
              await tx.$queryRaw`SELECT agent_sync_authorize(${user}::uuid,${connection.id}::uuid,${workspace}::uuid,'mokara:read') AS data`;
            assert.equal(row.data, null);
            await assert.rejects(
              () =>
                second.$transaction(async (other) => {
                  await other.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");
                  await other.$executeRaw`DELETE FROM team_members WHERE team_id=${workspace}::uuid AND user_id=${user}::uuid`;
                }),
              (e) => dbErrorInfo(e).sqlState === "55P03"
            );
          });
          await second.teamMember.delete({
            where: { teamId_userId: { teamId: workspace, userId: user } },
          });
          await assert.rejects(
            () => agentChanges(actor, { workspace_id: workspace, limit: 10 }),
            error("agent_permission_denied")
          );
          await db.teamMember.create({ data: { teamId: workspace, userId: user, role: "owner" } });
        }
      );
      await t.test("a valid but expired cursor requires resynchronization", async () => {
        const body = Buffer.from(
          JSON.stringify({
            scope: `changes:${user}:${workspace}:*`,
            after: "0",
            expires: Date.now() - 1,
          })
        ).toString("base64url");
        const signature = createHmac("sha256", process.env.AUTH_SECRET)
          .update("agent-sync-v1:" + body)
          .digest("base64url");
        await assert.rejects(
          () =>
            agentChanges(actor, {
              workspace_id: workspace,
              limit: 10,
              cursor: body + "." + signature,
            }),
          error("agent_cursor_expired")
        );
      });
      await t.test("uncommitted events cannot be skipped by a later committed cursor", async () => {
        const a = await makeTask(),
          b = await makeTask();
        let release, allocated;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const signal = new Promise((resolve) => {
          allocated = resolve;
        });
        const first = db.$transaction(
          async (tx) => {
            await tx.task.update({ where: { id: a.id }, data: { description: "First commit" } });
            allocated();
            await gate;
          },
          { timeout: 10000 }
        );
        await signal;
        const before = await agentChanges(actor, { workspace_id: workspace, limit: 50 });
        // Capture the visible high-water mark without committing the held event.
        let cursor = before.next_cursor;
        while (
          (await agentChanges(actor, { workspace_id: workspace, limit: 50, cursor })).has_more
        ) {
          cursor = (await agentChanges(actor, { workspace_id: workspace, limit: 50, cursor }))
            .next_cursor;
        }
        const lastVisible = await agentChanges(actor, {
          workspace_id: workspace,
          limit: 50,
          cursor,
        });
        cursor = lastVisible.next_cursor;
        const later = second.task.update({
          where: { id: b.id },
          data: { description: "Second commit" },
        });
        release();
        await Promise.all([first, later]);
        const after = await agentChanges(actor, { workspace_id: workspace, limit: 50, cursor });
        assert.ok(after.items.some((e) => e.task_id === a.id));
        assert.ok(after.items.some((e) => e.task_id === b.id));
      });
      await t.test(
        "real MCP transport preserves old tools and enforces separately approved scopes",
        async () => {
          await db.mcpConnection.update({
            where: { id: connection.id },
            data: { tokenHash: token.tokenHash, scopes: ["mokara:read"] },
          });
          const app = new Hono().route("/mcp", mcpRoutes);
          async function rpc(method, params = {}) {
            const response = await app.request("/mcp", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token.token}`,
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
              },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            });
            assert.equal(response.status, 200);
            return (await response.json()).result;
          }
          const legacy = await rpc("tools/list");
          assert.ok(legacy.tools.some((t) => t.name === "get_task"));
          assert.ok(!legacy.tools.some((t) => t.name === "claim_agent_task"));
          const capability = await rpc("tools/call", {
            name: "get_agent_execution_capabilities",
            arguments: {},
          });
          assert.equal(capability.structuredContent.default_ready, false);
          await db.mcpConnection.update({ where: { id: connection.id }, data: { scopes } });
          const available = (await rpc("tools/list")).tools.map((tool) => tool.name);
          for (const name of Object.values(capability.structuredContent.tools))
            assert.ok(available.includes(name), name);
          const task = await makeTask();
          await ready(task);
          const input = await claimInput(task);
          delete input.action;
          const result = await rpc("tools/call", { name: "claim_agent_task", arguments: input });
          assert.equal(result.structuredContent.execution.state, "claimed");
          assert.equal(JSON.stringify(result).includes("installation_id"), false);
          const conflict = await rpc("tools/call", {
            name: "set_task_agent_readiness",
            arguments: { ...fields(task), expected_revision: "1", ready: true },
          });
          const failure = JSON.parse(conflict.content[0].text);
          assert.equal(failure.error, "agent_revision_conflict");
          assert.ok(failure.details.current_revision);
          const browser = new Hono();
          browser.use("*", async (c, next) => {
            c.set("userId", user);
            await next();
          });
          browser.route("/", agentSyncRoutes);
          assert.equal(
            (await browser.request(`/teams/not-uuid/tasks/${task.id}/agent`)).status,
            400
          );
          const detail = await browser.request(`/teams/${workspace}/tasks/${task.id}/agent`);
          assert.equal(detail.status, 200);
          assert.equal((await detail.json()).execution.id, result.structuredContent.execution.id);
          const forbidden = await browser.request("/agent/commands", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(await claimInput(task)), action: "claim" }),
          });
          assert.equal(forbidden.status, 403);
        }
      );
      await t.test("events and claim ledger roll back with the transaction", async () => {
        const task = await makeTask();
        await ready(task);
        const input = await claimInput(task);
        const count = await db.agentSyncEvent.count({ where: { workspaceId: workspace } });
        await assert.rejects(
          () =>
            db.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT agent_sync_command(${user}::uuid,${connection.id}::uuid,'claim',${JSON.stringify(input)}::jsonb)`;
              throw Error("forced rollback");
            }),
          /forced rollback/
        );
        assert.equal(await db.agentExecution.count({ where: { taskId: task.id } }), 0);
        assert.equal(
          await db.agentSyncRequest.count({ where: { requestId: input.request_id } }),
          0
        );
        assert.equal(await db.agentSyncEvent.count({ where: { workspaceId: workspace } }), count);
        assert.ok((await agentCommand(actor, input)).execution);
      });
    } finally {
      await db.team.deleteMany({ where: { id: { in: [workspace, otherWorkspace] } } });
      await db.user.delete({ where: { id: user } });
      await Promise.all([db.$disconnect(), second.$disconnect()]);
    }
  });
}
