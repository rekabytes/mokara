import type { Prisma } from "@mokara/db/prisma/generated/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { dbErrorInfo } from "./db-error.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { McpFailure } from "../mcp/errors.ts";
import { requireScope, type McpPrincipal } from "../mcp/access.ts";
import type { AgentCommand } from "./agent-sync-contract.ts";
export type AgentActor =
  { kind: "user"; userId: string } | { kind: "connection"; principal: McpPrincipal };
const object = z.record(z.string(), z.json());
const failure = z.object({
  error: z.string(),
  message: z.string(),
  status: z.union([z.literal(400), z.literal(403), z.literal(404), z.literal(409), z.literal(503)]),
  details: object,
});
const cursorSchema = z
  .object({ scope: z.string(), after: z.string(), expires: z.number() })
  .strict();
function checked(data: unknown) {
  const error = failure.safeParse(data);
  if (error.success)
    throw new McpFailure(
      error.data.error,
      error.data.message,
      error.data.status,
      undefined,
      error.data.details
    );
  return object.parse(data);
}
export function identity(actor: AgentActor) {
  return actor.kind === "user"
    ? { userId: actor.userId, connectionId: null }
    : { userId: actor.principal.userId, connectionId: actor.principal.connectionId };
}
function assertScope(
  actor: AgentActor,
  scope: "mokara:read" | "mokara:agent:manage" | "mokara:agent:execute"
) {
  if (actor.kind === "connection") requireScope(actor.principal, scope);
  else if (scope === "mokara:agent:execute")
    throw new McpFailure(
      "agent_permission_denied",
      "Use an external connection with execution permission.",
      403
    );
}
async function authorize(tx: Prisma.TransactionClient, actor: AgentActor, workspace: string) {
  assertScope(actor, "mokara:read");
  const id = identity(actor);
  const [row] = await tx.$queryRaw<
    { data: unknown }[]
  >`SELECT agent_sync_authorize(${id.userId}::uuid,${id.connectionId}::uuid,${workspace}::uuid,'mokara:read') AS data`;
  if (row?.data) checked(row.data);
}
export async function agentCommand(actor: AgentActor, input: AgentCommand) {
  const manage = ["readiness", "pause", "requeue", "cancel"].includes(input.action);
  assertScope(actor, manage ? "mokara:agent:manage" : "mokara:agent:execute");
  const id = identity(actor);
  let rows;
  try {
    rows = await prisma.$queryRaw<
      { data: unknown }[]
    >`SELECT agent_sync_command(${id.userId}::uuid,${id.connectionId}::uuid,${input.action},${JSON.stringify(input)}::jsonb) AS data`;
  } catch (error) {
    const info = dbErrorInfo(error);
    if (info.code === "P2034" || ["40P01", "40001"].includes(info.sqlState))
      throw new McpFailure(
        "agent_transaction_retry",
        "The transaction was rolled back. Retry with the same request_id and payload.",
        503
      );
    throw error;
  }
  return checked(rows[0]?.data);
}
function cursorKey() {
  if (env.AUTH_SECRET.length < 32)
    throw new McpFailure(
      "agent_sync_unavailable",
      "Agent sync needs a configured authentication secret.",
      503
    );
  return env.AUTH_SECRET;
}
function sign(value: string) {
  return createHmac("sha256", cursorKey())
    .update("agent-sync-v1:" + value)
    .digest("base64url");
}
export function encodeAgentCursor(scope: string, after: string) {
  const body = Buffer.from(
    JSON.stringify({ scope, after, expires: Date.now() + 30 * 86400000 })
  ).toString("base64url");
  return body + "." + sign(body);
}
export function decodeAgentCursor(scope: string, raw?: string) {
  if (!raw) return null;
  const [body, signature, ...extra] = raw.split(".");
  if (!body || !signature || extra.length || signature.length !== 43)
    throw new McpFailure(
      "agent_cursor_invalid",
      "Start synchronization again without a cursor.",
      400
    );
  const expected = Buffer.from(sign(body)),
    actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new McpFailure(
      "agent_cursor_invalid",
      "Start synchronization again without a cursor.",
      400
    );
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new McpFailure(
      "agent_cursor_invalid",
      "Start synchronization again without a cursor.",
      400
    );
  }
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.scope !== scope)
    throw new McpFailure(
      "agent_cursor_invalid",
      "This cursor belongs to another query. Start without a cursor.",
      400
    );
  if (parsed.data.expires <= Date.now())
    throw new McpFailure(
      "agent_cursor_expired",
      "Start synchronization again. Reconcile saved execution IDs instead of creating replacement runs.",
      409
    );
  return parsed.data.after;
}
async function projectAccess(tx: Prisma.TransactionClient, workspace: string, project?: string) {
  if (
    project &&
    !(await tx.project.findFirst({
      where: { id: project, teamId: workspace },
      select: { id: true },
    }))
  )
    throw new McpFailure("agent_permission_denied", "Project not found in this workspace.", 403);
}
async function currentTask(tx: Prisma.TransactionClient, workspace: string, task: string) {
  const row = await tx.task.findFirst({ where: { id: task, teamId: workspace } });
  if (!row) throw new McpFailure("not_found", "Task not found in this workspace.", 404);
  return row;
}
export async function agentTask(
  actor: AgentActor,
  workspace: string,
  task: string,
  includeDetails = true
) {
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, workspace);
      const t = await currentTask(tx, workspace, task);
      const [row] = includeDetails
        ? await tx.$queryRaw<
            { data: unknown }[]
          >`SELECT agent_sync_snapshot(t) AS data FROM tasks t WHERE id=${task}::uuid`
        : [];
      const executions = await tx.$queryRaw<
        { data: unknown }[]
      >`SELECT agent_execution_public(r) AS data FROM agent_executions r WHERE task_id=${task}::uuid ORDER BY claimed_at DESC,id DESC LIMIT 1`;
      const latest = await tx.agentExecution.findFirst({
        where: { taskId: task },
        orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
        select: { acceptedContentRevision: true },
      });
      return {
        task: includeDetails
          ? checked(row?.data)
          : { id: t.id, title: t.title, revision: t.agentRevision.toString() },
        ready: t.agentReady,
        paused: t.agentSyncPaused,
        revision: t.agentRevision.toString(),
        execution: executions[0] ? checked(executions[0].data) : null,
        new_information: latest ? t.agentContentRevision > latest.acceptedContentRevision : false,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function agentTaskSnapshot(
  actor: AgentActor,
  input: {
    workspace_id: string;
    task_id: string;
    expected_revision: string;
    offset: number;
    limit: number;
  }
) {
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, input.workspace_id);
      const task = await currentTask(tx, input.workspace_id, input.task_id);
      if (task.agentRevision.toString() !== input.expected_revision)
        throw new McpFailure(
          "agent_revision_conflict",
          "The task changed. Restart reading its instructions.",
          409,
          undefined,
          { current_revision: task.agentRevision.toString() }
        );
      const [row] = await tx.$queryRaw<
        { data: unknown }[]
      >`SELECT agent_sync_snapshot(t) AS data FROM tasks t WHERE id=${input.task_id}::uuid`;
      const text = JSON.stringify(checked(row?.data)),
        end = input.offset + input.limit;
      return {
        task_id: task.id,
        revision: task.agentRevision.toString(),
        encoding: "json",
        text: text.slice(input.offset, end),
        next_offset: end < text.length ? end : null,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function readyAgentTasks(
  actor: AgentActor,
  input: { workspace_id: string; project_id?: string; limit: number; cursor?: string }
) {
  const scope = `ready:${identity(actor).userId}:${input.workspace_id}:${input.project_id ?? "*"}`;
  const after = decodeAgentCursor(scope, input.cursor);
  if (after && !z.uuid().safeParse(after).success)
    throw new McpFailure("agent_cursor_invalid", "Restart ready-task discovery.", 400);
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, input.workspace_id);
      await projectAccess(tx, input.workspace_id, input.project_id);
      const rows = await tx.task.findMany({
        where: {
          teamId: input.workspace_id,
          agentReady: true,
          agentSyncPaused: false,
          ...(after ? { id: { gt: after } } : {}),
          ...(input.project_id ? { projectId: input.project_id } : {}),
          OR: [{ projectId: null }, { project: { archived: false } }],
        },
        select: { id: true, title: true, agentRevision: true, projectId: true },
        orderBy: { id: "asc" },
        take: input.limit + 1,
      });
      const items = rows.slice(0, input.limit),
        last = items.at(-1);
      return {
        items: items.map((t) => ({
          id: t.id,
          title: t.title,
          project_id: t.projectId,
          revision: t.agentRevision.toString(),
          ready: true,
        })),
        next_cursor: rows.length > input.limit && last ? encodeAgentCursor(scope, last.id) : null,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function agentChanges(
  actor: AgentActor,
  input: { workspace_id: string; project_id?: string; limit: number; cursor?: string }
) {
  const scope = `changes:${identity(actor).userId}:${input.workspace_id}:${input.project_id ?? "*"}`;
  const after = decodeAgentCursor(scope, input.cursor) ?? "0";
  if (!/^[0-9]{1,19}$/.test(after))
    throw new McpFailure("agent_cursor_invalid", "Restart synchronization.", 400);
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, input.workspace_id);
      await projectAccess(tx, input.workspace_id, input.project_id);
      const rows = await tx.agentSyncEvent.findMany({
        where: {
          workspaceId: input.workspace_id,
          sequence: { gt: BigInt(after) },
          ...(input.project_id ? { projectId: input.project_id } : {}),
        },
        orderBy: { sequence: "asc" },
        take: input.limit + 1,
      });
      const page = rows.slice(0, input.limit),
        last = page.at(-1);
      return {
        items: page.map((e) => ({
          sequence: e.sequence.toString(),
          task_id: e.taskId,
          project_id: e.projectId,
          kind: e.kind,
          revision: e.revision.toString(),
          origin: e.origin,
          own_update:
            actor.kind === "connection" && e.connectionId === actor.principal.connectionId,
          execution_id: e.executionId,
          occurred_at: e.occurredAt.toISOString(),
        })),
        has_more: rows.length > input.limit,
        next_cursor: encodeAgentCursor(scope, last?.sequence.toString() ?? after),
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function agentHistory(
  actor: AgentActor,
  input: {
    workspace_id: string;
    task_id: string;
    project_id?: string;
    limit: number;
    cursor?: string;
  }
) {
  const scope = `history:${identity(actor).userId}:${input.workspace_id}:${input.task_id}`;
  const after = decodeAgentCursor(scope, input.cursor);
  let key: { at: string; id: string } | null = null;
  if (after) {
    try {
      key = z
        .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
        .strict()
        .parse(JSON.parse(after));
    } catch {
      throw new McpFailure("agent_cursor_invalid", "Restart execution history.", 400);
    }
  }
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, input.workspace_id);
      const task = await currentTask(tx, input.workspace_id, input.task_id);
      await projectAccess(tx, input.workspace_id, input.project_id);
      if (input.project_id && task.projectId !== input.project_id)
        throw new McpFailure(
          "agent_permission_denied",
          "Task is not in the requested project.",
          403
        );
      const rows = await tx.$queryRaw<
        { data: unknown; id: string; claimed_at: Date }[]
      >`SELECT agent_execution_public(r) AS data,id,claimed_at FROM agent_executions r WHERE task_id=${input.task_id}::uuid AND (${key?.at ?? null}::timestamptz IS NULL OR (claimed_at,id)<(${key?.at ?? null}::timestamptz,${key?.id ?? null}::uuid)) ORDER BY claimed_at DESC,id DESC LIMIT ${input.limit + 1}`;
      const items = rows.slice(0, input.limit),
        last = items.at(-1);
      return {
        items: items.map((r) => checked(r.data)),
        next_cursor:
          rows.length > input.limit && last
            ? encodeAgentCursor(
                scope,
                JSON.stringify({ at: last.claimed_at.toISOString(), id: last.id })
              )
            : null,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function agentSnapshot(
  actor: AgentActor,
  input: {
    workspace_id: string;
    task_id: string;
    execution_id: string;
    offset: number;
    limit: number;
  }
) {
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor, input.workspace_id);
      await currentTask(tx, input.workspace_id, input.task_id);
      const run = await tx.agentExecution.findFirst({
        where: { id: input.execution_id, taskId: input.task_id, workspaceId: input.workspace_id },
        select: { snapshot: true, acceptedRevision: true },
      });
      if (!run) throw new McpFailure("not_found", "Execution not found.", 404);
      const text = JSON.stringify(run.snapshot),
        end = input.offset + input.limit;
      return {
        execution_id: input.execution_id,
        accepted_revision: run.acceptedRevision.toString(),
        encoding: "json",
        text: text.slice(input.offset, end),
        next_offset: end < text.length ? end : null,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
export async function expireAgentLeases() {
  return prisma.$executeRaw`UPDATE agent_executions SET state='unknown',finished_at=clock_timestamp() WHERE state IN ('claimed','running','cancel_requested') AND lease_expires_at<=clock_timestamp()`;
}
