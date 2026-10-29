import { z } from "zod";
import {
  agentCapabilities,
  agentCommands,
  agentCommandSchema,
  agentListSchema,
  agentTaskReadSchema,
  agentTaskSnapshotSchema,
  agentHistorySchema,
  agentSnapshotSchema,
} from "../lib/agent-sync-contract.ts";
import {
  agentCommand,
  agentTask,
  agentTaskSnapshot,
  readyAgentTasks,
  agentChanges,
  agentHistory,
  agentSnapshot,
  type AgentActor,
} from "../lib/agent-sync.ts";
import { checkLimit, type McpPrincipal } from "./access.ts";
import type { ToolRegistrar } from "./tool-types.ts";
export function registerAgentTools(register: ToolRegistrar, principal: McpPrincipal) {
  const actor: AgentActor = { kind: "connection", principal };
  register(
    "get_agent_execution_capabilities",
    "Discover the general-purpose agent execution contract. Reading or syncing a task never authorizes execution.",
    z.object({}).strict(),
    async () => agentCapabilities
  );
  register(
    "list_ready_agent_tasks",
    "List tasks explicitly authorized for agents. Always read full instructions before claiming. A list cursor is for discovery, not durable synchronization.",
    agentListSchema,
    (i) => readyAgentTasks(actor, i)
  );
  register(
    "get_agent_task",
    "Read the complete instructions, steps, attachment metadata, readiness, revision and latest execution. Use existing read_attachment for authorized file content before starting.",
    agentTaskReadSchema,
    (i) => agentTask(actor, i.workspace_id, i.task_id, i.include_details)
  );
  register(
    "read_agent_task_snapshot",
    "Read current full task instructions in bounded JSON chunks before claiming. Use get_agent_task with include_details=false to obtain revision for large tasks. Restart on revision conflict.",
    agentTaskSnapshotSchema,
    (i) => agentTaskSnapshot(actor, i)
  );
  register(
    "list_agent_task_changes",
    "Read durable changes with a signed opaque cursor. Start without a cursor and persist each page with next_cursor atomically. Events never authorize execution.",
    agentListSchema,
    (i) => agentChanges(actor, i)
  );
  register(
    "list_agent_execution_history",
    "Read a task's execution history. The current task must remain accessible. Results never contain private connection or installation IDs.",
    agentHistorySchema,
    (i) => agentHistory(actor, i)
  );
  register(
    "read_agent_execution_snapshot",
    "Read the immutable accepted instructions as paginated JSON text. Concatenate chunks by next_offset. Current task access is required.",
    agentSnapshotSchema,
    (i) => agentSnapshot(actor, i)
  );
  function command<S extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: z.ZodObject<S>,
    action: keyof typeof agentCommands,
    manage = false
  ) {
    register(
      name,
      description,
      schema,
      async (i) => {
        await checkLimit("mcpWrite", principal.userId);
        // Parse the command union at the MCP boundary, before passing typed data to the service.
        return agentCommand(actor, agentCommandSchema.parse({ ...i, action }));
      },
      { scope: manage ? "mokara:agent:manage" : "mokara:agent:execute", readOnly: false }
    );
  }
  command(
    "set_task_agent_readiness",
    "Explicitly authorize a task for external execution or withdraw readiness. Requires the current revision. Withdrawal does not stop running work.",
    agentCommands.readiness,
    "readiness",
    true
  );
  command(
    "set_task_agent_sync_paused",
    "Pause ready-task discovery and ask clients to pause automatic mirroring. This does not withdraw readiness or stop execution. Lease and cancellation handling must continue.",
    agentCommands.pause,
    "pause",
    true
  );
  command(
    "requeue_agent_task",
    "Explicitly authorize a new run after completion or an unknown outcome. Live claims must be cancelled first. Unknown outcomes may have external side effects; review them before requeueing.",
    agentCommands.requeue,
    "requeue",
    true
  );
  command(
    "claim_agent_task",
    "Atomically claim a ready task for a generic client_id and stable installation_id. Requires expected_revision. Execution ownership is bound to this authenticated connection and installation, not a readable run ID alone.",
    agentCommands.claim,
    "claim"
  );
  command(
    "start_agent_execution",
    "Start your claimed execution after reading accepted instructions and authorized attachments. Ordinary task status is unchanged.",
    agentCommands.start,
    "start"
  );
  command(
    "renew_agent_execution_lease",
    "Renew a live lease for the owning connection and installation. Server time decides expiry. Stop work when ownership is lost or the lease expires.",
    agentCommands.renew,
    "renew"
  );
  command(
    "report_agent_execution_progress",
    "Report bounded progress for your running execution. This does not renew the lease. Check get_agent_task for changed instructions and cancellation.",
    agentCommands.progress,
    "progress"
  );
  command(
    "complete_agent_execution",
    "Record results for your live running execution. Does not mark the ordinary task Done or authorize another run.",
    agentCommands.finish,
    "finish"
  );
  command(
    "fail_agent_execution",
    "Record a failure for your live execution. A user must authorize another run.",
    agentCommands.fail,
    "fail"
  );
  command(
    "request_agent_execution_cancellation",
    "Request cancellation. The process is not confirmed stopped until its owner acknowledges or a user resolves an unknown outcome.",
    agentCommands.cancel,
    "cancel",
    true
  );
  command(
    "acknowledge_agent_execution_cancellation",
    "Confirm your external process has stopped after cancellation was requested. Requires live ownership, even for deleted tasks.",
    agentCommands.cancel_ack,
    "cancel_ack"
  );
  command(
    "release_agent_execution",
    "Release a claim before starting, or record an unknown outcome after work started. Running work is not automatically requeued.",
    agentCommands.release,
    "release"
  );
}
