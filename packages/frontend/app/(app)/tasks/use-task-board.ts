"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api, type Task } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { onSse } from "@/lib/sse";
import { asBoardTask } from "./task-format";

type Options = Pick<ReturnType<typeof useAsyncError>, "run" | "setError"> & {
  teamId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
};

// Owns the board's server snapshot and live subscription. Mutations receive
// this same setter, so optimistic writes and SSE continue to share one list.
export function useTaskBoard({ teamId, run, setError, setSelectedTaskId }: Options) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // PRD-13: the spotlight tour may only point at controls that really exist, so
  // it waits for a SUCCESSFUL board load. Written beside `tasks` in the function
  // that owns the transition — never mirrored from `loading` in an effect, and
  // deliberately not just `!loading`, because a failed load would then coach
  // over an empty board that never arrived.
  const [boardReady, setBoardReady] = useState(false);

  const taskRead = useRef<AbortController | null>(null);
  const loadTasks = useCallback(async () => {
    taskRead.current?.abort();
    const controller = new AbortController();
    taskRead.current = controller;
    if (!teamId) return;
    setLoading(true);
    setBoardReady(false);
    setError(null);
    const list = await run(() => api.listTeamTasks(teamId, undefined, controller.signal), {
      fallback: "Failed to load tasks",
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setLoading(false);
    if (list) {
      setTasks(list);
      setBoardReady(true);
    }
  }, [teamId, run, setError]);

  // Server state, not app state: the task list belongs to the database, so
  // refetching when the container changes is outside-React sync (the one kind
  // this codebase allows). Shared *view* state deliberately lives in Jotai
  // instead — see task-view.ts.
  useEffect(() => {
    setTasks([]);
    setSelectedTaskId(null);
    setBoardReady(false);
    if (teamId) void loadTasks();
    else setLoading(false);
    return () => taskRead.current?.abort();
  }, [teamId, loadTasks, setSelectedTaskId]);

  // SSE sync (2026-09-07): teammates' task mutations land on this board
  // without a reload. Upsert-by-id so our own optimistic writes and the echo
  // of them on the same channel converge on one object; the reopen refetch
  // covers events missed while the connection was down. The team filter is
  // belt-and-braces (the server only sends channels we belong to) — events
  // for other containers must not leak into this list.
  useEffect(() => {
    if (!teamId) return;
    const upsert = (data: unknown) => {
      const t = asBoardTask(data);
      if (!t || t.team_id !== teamId) return;
      setTasks((prev) =>
        prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]
      );
    };
    const offs = [
      onSse("task_created", upsert),
      onSse("task_updated", upsert),
      onSse("task_deleted", (data) => {
        if (data === null || typeof data !== "object" || !("id" in data)) return;
        const id = data.id;
        if (typeof id !== "string") return;
        setTasks((prev) => prev.filter((x) => x.id !== id));
      }),
      onSse("sse:reopened", () => {
        void loadTasks();
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [teamId, loadTasks]);

  return { tasks, setTasks, loading, boardReady };
}
