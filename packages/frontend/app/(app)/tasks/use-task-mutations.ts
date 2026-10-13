"use client";

import { useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { api, type BindingDraft, type Task, type TaskPatch } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { PRIORITY_IDS } from "./board-model";

type Run = ReturnType<typeof useAsyncError>["run"];

/** Task commands share one ordering per task, because each response is a full
 * task snapshot. Unrelated tasks remain independent. Repeated pending commands
 * coalesce; a failed request never retries a mutation automatically. */
export function useTaskMutations({
  teamId,
  setTasks,
  setSelectedTaskId,
  run,
}: {
  teamId: string | null;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  run: Run;
}) {
  const context = useMemo(() => ({ teamId }), [teamId]);
  // Ordering survives switching away and back while a command is pending.
  // Context only controls which board may receive the completed snapshot.
  const queues = useRef({
    tails: new Map<string, Promise<void>>(),
    pending: new Map<string, Promise<void>>(),
    deleted: new Set<string>(),
  }).current;
  const current = useRef(context);
  current.current = context;

  function schedule(id: string, command: string, operation: () => Promise<void>): Promise<void> {
    const key = JSON.stringify([id, command]);
    const pending = queues.pending.get(key);
    if (pending) return pending;
    const previous = queues.tails.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (queues.deleted.has(id)) return;
        await operation();
      })
      .finally(() => {
        queues.pending.delete(key);
        if (queues.tails.get(id) === next) queues.tails.delete(id);
      });
    queues.pending.set(key, next);
    queues.tails.set(id, next);
    return next;
  }

  function apply(updated: Task) {
    if (current.current !== context || updated.team_id !== context.teamId) return;
    setTasks((previous) =>
      previous.map((task) => {
        if (task.id !== updated.id) return task;
        // An SSE update may already be newer than the HTTP response.
        return Date.parse(task.updated_at) > Date.parse(updated.updated_at) ? task : updated;
      })
    );
  }

  function updateTaskField(id: string, patch: TaskPatch) {
    return schedule(id, JSON.stringify(["patch", patch]), async () => {
      const updated = await run(() => api.updateTask(id, patch), {
        fallback: "Failed to update task",
      });
      if (updated) apply(updated);
    });
  }

  function toggleTask(task: Task) {
    return updateTaskField(task.id, { status: task.status === "done" ? "todo" : "done" });
  }

  function cyclePriority(task: Task) {
    const priority = PRIORITY_IDS[(PRIORITY_IDS.indexOf(task.priority) + 1) % PRIORITY_IDS.length];
    return updateTaskField(task.id, { priority });
  }

  function toggleFlag(task: Task) {
    return schedule(task.id, "flag", async () => {
      const updated = await run(() => api.flagTask(task.id), { fallback: "Failed to update task" });
      if (updated) apply(updated);
    });
  }

  function removeTask(id: string) {
    return schedule(id, "delete", async () => {
      const result = await run(() => api.deleteTask(id), { fallback: "Failed to delete task" });
      if (result === null) return;
      queues.deleted.add(id);
      if (current.current !== context) return;
      setTasks((previous) => previous.filter((task) => task.id !== id));
      setSelectedTaskId((selected) => (selected === id ? null : selected));
    });
  }

  function setTaskKpis(id: string, bindings: BindingDraft[]) {
    return schedule(id, JSON.stringify(["kpis", bindings]), async () => {
      const updated = await run(() => api.setTaskKpis(id, bindings), {
        fallback: "Failed to update KPI weights",
      });
      if (updated) apply(updated);
    });
  }

  function retryGitHubIssue(task: Task) {
    return schedule(task.id, "github-retry", async () => {
      if (task.github_issue?.status === "linked") {
        const updated = await run(() => api.retryGitHubSync(task.id), {
          fallback: "Couldn't retry GitHub status sync.",
        });
        if (updated) apply(updated);
        return;
      }
      const repositoryId = task.github_issue?.repository_id;
      if (!repositoryId) return;
      const result = await run(() => api.publishGitHubIssue(task.id, repositoryId), {
        fallback: "The GitHub issue could not be created.",
      });
      if (!result || current.current !== context) return;
      const fresh = await run(() => api.getTask(task.id), {
        fallback: "Failed to refresh the task",
      });
      if (fresh) apply(fresh);
    });
  }

  return {
    toggleTask,
    cyclePriority,
    toggleFlag,
    removeTask,
    updateTaskField,
    setTaskKpis,
    retryGitHubIssue,
  };
}
