import { z } from "zod";
const uuid = z.uuid();
const revision = z.string().regex(/^[1-9][0-9]{0,17}$/);
const base = { workspace_id: uuid, task_id: uuid, request_id: uuid };
const expected = { ...base, expected_revision: revision };
const owned = { ...base, execution_id: uuid, installation_id: uuid };
const lease = z.number().int().min(30).max(900).default(120);
export const agentCommands = {
  readiness: z.object({ ...expected, ready: z.boolean() }).strict(),
  pause: z.object({ ...expected, paused: z.boolean() }).strict(),
  requeue: z.object(expected).strict(),
  claim: z
    .object({
      ...expected,
      client_id: z.string().trim().min(1).max(80),
      installation_id: uuid,
      lease_seconds: lease,
    })
    .strict(),
  start: z.object(owned).strict(),
  renew: z.object({ ...owned, lease_seconds: lease }).strict(),
  progress: z
    .object({
      ...owned,
      message: z.string().max(10000),
      percent: z.number().int().min(0).max(100).nullable().default(null),
    })
    .strict(),
  finish: z.object({ ...owned, result: z.string().min(1).max(16000) }).strict(),
  fail: z.object({ ...owned, failure: z.string().min(1).max(10000) }).strict(),
  cancel: z.object(base).strict(),
  cancel_ack: z.object(owned).strict(),
  release: z.object(owned).strict(),
};
export const agentCommandSchema = z.discriminatedUnion("action", [
  agentCommands.readiness.extend({ action: z.literal("readiness") }),
  agentCommands.pause.extend({ action: z.literal("pause") }),
  agentCommands.requeue.extend({ action: z.literal("requeue") }),
  agentCommands.claim.extend({ action: z.literal("claim") }),
  agentCommands.start.extend({ action: z.literal("start") }),
  agentCommands.renew.extend({ action: z.literal("renew") }),
  agentCommands.progress.extend({ action: z.literal("progress") }),
  agentCommands.finish.extend({ action: z.literal("finish") }),
  agentCommands.fail.extend({ action: z.literal("fail") }),
  agentCommands.cancel.extend({ action: z.literal("cancel") }),
  agentCommands.cancel_ack.extend({ action: z.literal("cancel_ack") }),
  agentCommands.release.extend({ action: z.literal("release") }),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;
export const agentReadSchema = z.object({ workspace_id: uuid, task_id: uuid }).strict();
export const agentTaskReadSchema = agentReadSchema.extend({
  include_details: z.boolean().default(true),
});
export const agentTaskSnapshotSchema = agentReadSchema.extend({
  expected_revision: revision,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(16000).default(16000),
});
export const agentListSchema = z
  .object({
    workspace_id: uuid,
    project_id: uuid.optional(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(2048).optional(),
  })
  .strict();
export const agentHistorySchema = agentListSchema.extend({ task_id: uuid });
export const agentSnapshotSchema = agentReadSchema.extend({
  execution_id: uuid,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(16000).default(16000),
});
export const agentCapabilities = {
  version: "1",
  tools: {
    capabilities: "get_agent_execution_capabilities",
    ready_tasks: "list_ready_agent_tasks",
    task: "get_agent_task",
    task_snapshot: "read_agent_task_snapshot",
    changes: "list_agent_task_changes",
    history: "list_agent_execution_history",
    accepted_snapshot: "read_agent_execution_snapshot",
    readiness: "set_task_agent_readiness",
    pause: "set_task_agent_sync_paused",
    requeue: "requeue_agent_task",
    cancel: "request_agent_execution_cancellation",
    claim: "claim_agent_task",
    start: "start_agent_execution",
    renew: "renew_agent_execution_lease",
    progress: "report_agent_execution_progress",
    complete: "complete_agent_execution",
    fail: "fail_agent_execution",
    cancel_ack: "acknowledge_agent_execution_cancellation",
    release: "release_agent_execution",
  },
  readiness_required: true,
  default_ready: false,
  scopes: { manage: "mokara:agent:manage", execute: "mokara:agent:execute", read: "mokara:read" },
  ownership: "authenticated_connection_and_installation",
  lease_seconds: { min: 30, max: 900, default: 120 },
  cursor_ttl_days: 30,
  event_retention: "indefinite",
  idempotency_retention: "indefinite",
  expired_lease_state: "unknown",
  automatic_requeue: false,
  ordinary_status_authorizes_execution: false,
  initial_sync:
    "Read list_agent_task_changes without a cursor, upsert tasks by ID and revision, and continue using next_cursor. Only claim tasks explicitly marked ready.",
  task_snapshot_tool: "read_agent_task_snapshot",
  attachment_tools: ["list_attachments", "read_attachment", "get_task_details"],
};
