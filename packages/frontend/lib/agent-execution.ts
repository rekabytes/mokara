import { z } from "zod";
export const executionStates = [
  "claimed",
  "running",
  "cancel_requested",
  "finished",
  "failed",
  "cancelled",
  "unknown",
  "abandoned",
] as const;
const revision = z.string().regex(/^[1-9][0-9]*$/);
const timestamp = z.iso.datetime({ offset: true });
export const executionSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  workspace_id: z.uuid(),
  project_id: z.uuid().nullable(),
  client_id: z.string(),
  client_name: z.string(),
  state: z.enum(executionStates),
  accepted_revision: revision,
  claimed_at: timestamp,
  started_at: timestamp.nullable(),
  heartbeat_at: timestamp,
  lease_expires_at: timestamp,
  finished_at: timestamp.nullable(),
  progress: z.string(),
  progress_percent: z.number().int().min(0).max(100).nullable(),
  result: z.string().nullable(),
  failure: z.string().nullable(),
  task_deleted: z.boolean(),
});
export const agentDetailSchema = z.object({
  task: z.record(z.string(), z.json()),
  ready: z.boolean(),
  paused: z.boolean(),
  revision: revision,
  execution: executionSchema.nullable(),
  new_information: z.boolean(),
  history: z.array(executionSchema),
  next_history_cursor: z.string().nullable(),
});
export const agentResultSchema = z.union([
  z.object({ task_id: z.string(), revision: revision, ready: z.boolean(), paused: z.boolean() }),
  z.object({ execution: executionSchema }),
]);
export const agentHistoryResultSchema = z.object({
  items: z.array(executionSchema),
  next_cursor: z.string().nullable(),
});
export type AgentDetail = z.infer<typeof agentDetailSchema>;
export type AgentExecution = z.infer<typeof executionSchema>;
export type AgentUserCommand = { workspace_id: string; task_id: string; request_id: string } & (
  | { action: "readiness"; expected_revision: string; ready: boolean }
  | { action: "pause"; expected_revision: string; paused: boolean }
  | { action: "requeue"; expected_revision: string }
  | { action: "cancel" }
);
export const executionLabels: Record<AgentExecution["state"], string> = {
  claimed: "Claimed",
  running: "Running",
  cancel_requested: "Cancellation requested",
  finished: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Outcome unknown",
  abandoned: "Recovered",
};
export function agentActions(detail: Pick<AgentDetail, "ready" | "execution">) {
  const state = detail.execution?.state;
  const live = state === "claimed" || state === "running" || state === "cancel_requested";
  return {
    live,
    canReady: !live && state !== "unknown" && !detail.ready,
    canCancel: state === "claimed" || state === "running",
    canRequeue:
      !live &&
      (state === "unknown" ||
        state === "finished" ||
        state === "failed" ||
        state === "cancelled" ||
        state === "abandoned"),
  };
}
