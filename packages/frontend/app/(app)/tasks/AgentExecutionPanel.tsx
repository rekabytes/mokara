"use client";
import { AgentExecutionDetails } from "./AgentExecutionDetails";
import { useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { api, type Task } from "@/lib/api";
import { type AgentUserCommand, type AgentDetail } from "@/lib/agent-execution";
import { normalizeError } from "@/lib/errors";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useAsyncError } from "@/hooks/useAsyncError";
export function AgentExecutionPanel({
  task,
  onChange,
}: {
  task: Task;
  onChange: (detail: AgentDetail) => void;
}) {
  const request = useMemo(
    () => ({ workspace: task.team_id, id: task.id, updatedAt: task.updated_at }),
    [task.team_id, task.id, task.updated_at]
  );
  const resource = useMemo(
    () =>
      atomWithRefresh(async (_get, { signal }) => {
        if (typeof window === "undefined") return null;
        return api.agentTask(request.workspace, request.id, signal);
      }),
    [request]
  );
  const state = useAtomValue(useMemo(() => loadable(resource), [resource]));
  const refresh = useSetAtom(resource);
  const { error, run, clearError } = useAsyncError();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{
    taskId: string;
    updatedAt: string;
    detail: AgentDetail;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const pending = useRef<AgentUserCommand | null>(null);
  const detail =
    saved?.taskId === task.id && saved.updatedAt === task.updated_at
      ? saved.detail
      : state.state === "hasData"
        ? state.data
        : null;
  async function change(input: AgentUserCommand) {
    setBusy(true);
    clearError();
    setNotice("");
    pending.current = input;
    try {
      const result = await run(() => api.agentCommand(input), {
        onError: (err) => {
          if (err.kind !== "network" && err.kind !== "server" && err.kind !== "unknown")
            pending.current = null;
        },
      });
      if (result) {
        pending.current = null;
        const latest = await run(() => api.agentTask(task.team_id, task.id));
        if (latest) {
          setSaved({ taskId: task.id, updatedAt: task.updated_at, detail: latest });
          onChange(latest);
        } else refresh();
        setNotice("Saved.");
      }
    } finally {
      setBusy(false);
    }
  }
  function act(action: "readiness" | "pause" | "requeue" | "cancel", value = false) {
    if (!detail || busy || pending.current) return;
    if (
      action === "requeue" &&
      !window.confirm(
        "An earlier execution may have changed files or external services. Review its outcome before authorizing another run. Requeue this task?"
      )
    )
      return;
    const base = { workspace_id: task.team_id, task_id: task.id, request_id: crypto.randomUUID() };
    if (action === "cancel") void change({ ...base, action });
    else if (action === "readiness")
      void change({ ...base, action, ready: value, expected_revision: detail.revision });
    else if (action === "pause")
      void change({ ...base, action, paused: value, expected_revision: detail.revision });
    else void change({ ...base, action, expected_revision: detail.revision });
  }
  return (
    <section
      className="mx-5 my-4 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] p-4"
      aria-labelledby={`agent-${task.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`agent-${task.id}`} className="m-0 text-sm font-medium">
          Agent work
        </h3>
        <button
          type="button"
          className="btn-base btn-ghost btn-small"
          disabled={busy}
          onClick={() => {
            setSaved(null);
            refresh();
            setNotice("");
          }}
        >
          Refresh
        </button>
      </div>
      {!detail && state.state === "loading" && (
        <p role="status" className="text-xs text-[var(--color-ink-muted)]">
          Loading agent status…
        </p>
      )}
      {state.state === "hasError" && !detail && (
        <ErrorBanner message={normalizeError(state.error).message} />
      )}
      {detail && (
        <AgentExecutionDetails
          detail={detail}
          blocked={busy || pending.current !== null}
          onAction={act}
          onMore={() =>
            void run(() =>
              api.agentHistory(task.team_id, task.id, detail.next_history_cursor ?? undefined)
            ).then((page) => {
              if (page)
                setSaved({
                  taskId: task.id,
                  updatedAt: task.updated_at,
                  detail: {
                    ...detail,
                    history: [...detail.history, ...page.items],
                    next_history_cursor: page.next_cursor,
                  },
                });
            })
          }
        />
      )}
      <ErrorBanner message={error?.message} />
      {error && pending.current && (
        <button
          type="button"
          className="btn-base btn-ghost btn-small mt-2"
          disabled={busy}
          onClick={() => {
            const input = pending.current;
            if (input) void change(input);
          }}
        >
          Retry same request
        </button>
      )}
      <p role="status" aria-live="polite" className="mb-0 text-xs text-[var(--color-ink-muted)]">
        {busy ? "Saving…" : notice}
      </p>
    </section>
  );
}
