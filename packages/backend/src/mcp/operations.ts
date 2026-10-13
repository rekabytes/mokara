import { z } from "zod";
import { prisma } from "../db.ts";
import { isUniqueViolation } from "../lib/db-error.ts";
import {
  requireWorkspace,
  requireScope,
  hashCredential,
  checkLimit,
  type McpPrincipal,
} from "./access.ts";
import type { McpScope } from "./permissions.ts";
import { McpFailure } from "./errors.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  return value;
}
const payloadSchema = z.record(z.string(), z.json());
const failureSchema = z.object({ error: z.string(), message: z.string() });
export async function mutation(
  principal: McpPrincipal,
  operation: string,
  scope: McpScope,
  input: { workspace_id: string; request_id: string },
  action: () => Promise<Record<string, unknown>>
) {
  requireScope(principal, scope);
  await requireWorkspace(principal, input.workspace_id);
  const requestHash = hashCredential(JSON.stringify(canonical({ operation, input })));
  const key = {
    connectionId_requestId: { connectionId: principal.connectionId, requestId: input.request_id },
  };
  let row = await prisma.mcpOperation.findUnique({ where: key });
  let reserved = false;
  if (!row) {
    await checkLimit("mcpWrite", principal.userId);
    try {
      row = await prisma.mcpOperation.create({
        data: {
          connectionId: principal.connectionId,
          userId: principal.userId,
          workspaceId: input.workspace_id,
          requestId: input.request_id,
          operation,
          requestHash,
        },
      });
      reserved = true;
    } catch (error) {
      if (!isUniqueViolation(error, "mcp_operations_connection_id_request_id_key")) throw error;
      row = await prisma.mcpOperation.findUnique({ where: key });
      if (!row) throw error;
    }
  }
  if (reserved && row) {
    try {
      const result = payloadSchema.parse(JSON.parse(JSON.stringify(await action())));
      await prisma.mcpOperation.update({
        where: { id: row.id },
        data: { operation, status: "succeeded", result, finishedAt: new Date() },
      });
      return { ...result, request_id: input.request_id };
    } catch (error) {
      if (error instanceof McpFailure && error.status < 500) {
        await prisma.mcpOperation.update({
          where: { id: row.id },
          data: {
            operation,
            status: "failed",
            result: { error: error.code, message: error.message },
            finishedAt: new Date(),
          },
        });
      }
      // Unexpected failures may occur after a domain write. Keep a durable
      // pending entry so a retry cannot duplicate a task/issue/upload.
      throw error;
    }
  }
  if (!row) throw new McpFailure("service_unavailable", "Operation tracking is unavailable.", 503);
  if (row.requestHash !== requestHash || row.workspaceId !== input.workspace_id)
    throw new McpFailure(
      "mcp_request_conflict",
      "This request ID was already used for a different operation.",
      409
    );
  if (row.status === "pending")
    throw new McpFailure(
      "mcp_operation_pending",
      "This request is running or has an uncertain result. Inspect activity before taking further action.",
      409
    );
  const data = payloadSchema.parse(row.result);
  if (row.status === "failed") {
    const failure = failureSchema.parse(data);
    throw new McpFailure(failure.error, failure.message, 409);
  }
  return { ...data, request_id: input.request_id, replayed: true };
}

export type Target = "task" | "comment" | "subtask" | "project" | "kpi" | "attachment";
export async function requireTarget(
  principal: McpPrincipal,
  workspaceId: string,
  kind: Target,
  id: string
) {
  await requireWorkspace(principal, workspaceId);
  const query = { where: { id, teamId: workspaceId }, select: { id: true } };
  const nested = { where: { id, task: { teamId: workspaceId } }, select: { id: true } };
  const row =
    kind === "task"
      ? await prisma.task.findFirst(query)
      : kind === "project"
        ? await prisma.project.findFirst(query)
        : kind === "kpi"
          ? await prisma.kpi.findFirst(query)
          : kind === "comment"
            ? await prisma.comment.findFirst(nested)
            : kind === "subtask"
              ? await prisma.subtaskItem.findFirst(nested)
              : await prisma.attachment.findFirst(query);
  if (!row) throw new McpFailure("not_found", "Item not found in this workspace.", 404);
}
