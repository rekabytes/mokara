import { agentActions, executionLabels, type AgentDetail } from "@/lib/agent-execution";
export function AgentExecutionDetails({
  detail,
  blocked,
  onAction,
  onMore,
}: {
  detail: AgentDetail;
  blocked: boolean;
  onAction: (action: "readiness" | "pause" | "requeue" | "cancel", value?: boolean) => void;
  onMore: () => void;
}) {
  const actions = agentActions(detail);
  return (
    <>
      <p className="mb-1 text-sm">
        {detail.ready ? "Ready for agent" : "Not ready"}
        {detail.paused ? " · Synchronization paused" : ""}
      </p>
      <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
        Ready lets an authorized external client claim and execute this task. Reading or editing the
        task does not authorize work.
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.canReady && (
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={blocked}
            onClick={() => onAction("readiness", true)}
          >
            Ready for agent
          </button>
        )}
        {detail.ready && (
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={blocked}
            onClick={() => onAction("readiness", false)}
          >
            Withdraw readiness
          </button>
        )}
        <button
          type="button"
          className="btn-base btn-ghost btn-small"
          disabled={blocked}
          onClick={() => onAction("pause", !detail.paused)}
        >
          {detail.paused ? "Resume synchronization" : "Pause synchronization"}
        </button>
        {actions.canCancel && (
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={blocked}
            onClick={() => onAction("cancel")}
          >
            Request cancellation
          </button>
        )}
        {actions.canRequeue && (
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={blocked}
            onClick={() => onAction("requeue")}
          >
            {detail.execution?.state === "unknown" ? "Recover and requeue" : "Requeue for agent"}
          </button>
        )}
      </div>
      {detail.execution && (
        <div className="mt-4 text-xs leading-5">
          <p className="mb-1 font-medium">
            {executionLabels[detail.execution.state]} · {detail.execution.client_name}
          </p>
          <p className="m-0 break-words text-[var(--color-ink-muted)]">
            Client {detail.execution.client_id}. Last check-in{" "}
            {new Date(detail.execution.heartbeat_at).toLocaleString()}.
          </p>
          {detail.execution.progress && (
            <p className="whitespace-pre-wrap break-words">{detail.execution.progress}</p>
          )}
          {detail.execution.progress_percent !== null && (
            <progress
              className="w-full accent-[var(--color-accent)]"
              max={100}
              value={detail.execution.progress_percent}
              aria-label="Execution progress"
            />
          )}
          {detail.new_information && (
            <p role="status">
              This task changed after the client accepted its instructions. The original execution
              snapshot is unchanged.
            </p>
          )}
          {detail.execution.state === "cancel_requested" && (
            <p role="status">
              Cancellation requested. The external process has not confirmed that it stopped.
            </p>
          )}
          {detail.execution.state === "unknown" && (
            <p role="status">
              The lease expired or the client released running work. Its outcome is unknown. Review
              external changes before requeueing.
            </p>
          )}
          {detail.execution.result && (
            <div className="whitespace-pre-wrap break-words">
              <p className="font-medium">Result</p>
              {detail.execution.result}
            </div>
          )}
          {detail.execution.failure && (
            <div className="whitespace-pre-wrap break-words">
              <p className="font-medium">Failure</p>
              {detail.execution.failure}
            </div>
          )}
        </div>
      )}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer">Execution history · {detail.history.length}</summary>
        <ol className="pl-4">
          {detail.history.map((item) => (
            <li key={item.id} className="my-3">
              <p>
                {executionLabels[item.state]} · {item.client_name} ·{" "}
                {new Date(item.claimed_at).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {item.result || item.failure || item.progress}
              </p>
            </li>
          ))}
        </ol>
        {detail.next_history_cursor && (
          <button
            type="button"
            className="btn-base btn-ghost btn-small"
            disabled={blocked}
            onClick={onMore}
          >
            Load more executions
          </button>
        )}
      </details>
    </>
  );
}
