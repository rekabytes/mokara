"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import {
  containerMembersAtom,
  GROUPS,
  GROUP_IDS,
  PRIORITY_IDS,
  PRIORITY_RANK,
} from "./board-model";
import { asBoardTask, isThisWeek, isToday } from "./task-format";
import { api, type Task, type TaskStatus, type TaskPatch, type BindingDraft } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";
import { useContainerMeta } from "@/lib/meta";
import { useSession } from "@/lib/session";
import { onSse } from "@/lib/sse";
import { taskFilterAtom, taskSortAtom, useCollapsedGroups, type GroupId } from "@/lib/tasksView";
import { DUR, snap } from "@/lib/motion";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageHeader } from "@/components/PageHeader";
import { TourOverlay } from "@/components/TourOverlay";

import { NewTaskModal } from "./NewTaskModal";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { BoardToolbar, TaskBoard } from "./Board";
import { useNewTaskDraft } from "./use-new-task-draft";

export default function TasksPage() {
  const session = useSession();
  // Owner rule (2026-09-05): KPI binding is personal — the chip only offers the
  // signed-in user's own KPIs, on both the modal and the drawer.
  const currentUserId = session.status === "authed" ? session.user.id : null;

  // PRD-06: the container comes from the global switcher atoms — no boot
  // fetch/effect here anymore. Containers failing is a boot-level error.
  const { selected, error: bootError } = useContainers();
  const teamId = selected?.id ?? null;
  const { projects, kpis: containerKpis } = useContainerMeta(selected?.id ?? null);
  const { error, setError, run } = useAsyncError();
  const [tasks, setTasks] = useState<Task[]>([]);
  // View preferences live in Jotai (lib/tasksView.ts), so they survive a trip
  // to /teams/x and back instead of resetting on every mount.
  const [filter, setFilter] = useAtom(taskFilterAtom);
  const [sort, setSort] = useAtom(taskSortAtom);
  const [loading, setLoading] = useState(true);
  // PRD-13: the spotlight tour may only point at controls that really exist, so
  // it waits for a SUCCESSFUL board load. Written beside `tasks` in the function
  // that owns the transition — never mirrored from `loading` in an effect, and
  // deliberately not just `!loading`, because a failed load would then coach
  // over an empty board that never arrived.
  const [boardReady, setBoardReady] = useState(false);

  const { collapsed, toggleGroup } = useCollapsedGroups();
  const {
    modalOpen,
    newTitle,
    setNewTitle,
    newDescription,
    setNewDescription,
    newPriority,
    setNewPriority,
    newStatus,
    setNewStatus,
    newDueDate,
    setNewDueDate,
    newProjectId,
    setNewProjectId,
    newKpis,
    setNewKpis,
    newAssigneeId,
    setNewAssigneeId,
    newSubtasks,
    setNewSubtasks,
    newFiles,
    setNewFiles,
    creating,
    createTaskFromModal,
    openModal,
    resetAndCloseModal,
    onModalKey,
  } = useNewTaskDraft({ teamId, run, setTasks });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setBoardReady(false);
    setError(null);
    const list = await run(() => api.listTeamTasks(teamId), { fallback: "Failed to load tasks" });
    setLoading(false);
    if (list) {
      setTasks(list);
      setBoardReady(true);
    }
  }, [teamId, run, setError]);

  // Server state, not app state: the task list belongs to the database, so
  // refetching when the container changes is outside-React sync (the one kind
  // this codebase allows). Shared *view* state deliberately lives in Jotai
  // instead — see lib/tasksView.ts.
  useEffect(() => {
    if (teamId) loadTasks();
  }, [teamId, loadTasks]);

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
        if (data === null || typeof data !== "object") return;
        const id = (data as { id?: unknown }).id;
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

  // PRD-10/11: container members shared by the drawer's AssigneeChip (main row
  // and "…" panel). Written into the Jotai atom so both locations see the same
  // list without either managing their own fetch.
  const [, setContainerMembers] = useAtom(containerMembersAtom);
  useEffect(() => {
    if (!teamId) {
      setContainerMembers([]);
      return;
    }
    let alive = true;
    void api
      .getTeam(teamId)
      .then((detail) => {
        if (alive) setContainerMembers(detail.members);
      })
      .catch(() => {
        if (alive) setContainerMembers([]);
      });
    return () => {
      alive = false;
    };
  }, [teamId, setContainerMembers]);

  async function toggleTask(t: Task) {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    const updated = await run(() => api.updateTask(t.id, { status: next }), {
      fallback: "Failed to update task",
    });
    if (!updated) return;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
  }

  async function cyclePriority(t: Task) {
    const next = PRIORITY_IDS[(PRIORITY_IDS.indexOf(t.priority) + 1) % PRIORITY_IDS.length];
    const updated = await run(() => api.updateTask(t.id, { priority: next }), {
      fallback: "Failed to update task",
    });
    if (!updated) return;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
  }

  async function toggleFlag(t: Task) {
    const updated = await run(() => api.flagTask(t.id), { fallback: "Failed to update task" });
    if (!updated) return;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
  }

  async function removeTask(id: string) {
    // deleteTask resolves void → undefined, so test for null, not falsiness.
    const ok = await run(() => api.deleteTask(id), { fallback: "Failed to delete task" });
    if (ok === null) return;
    setTasks((prev) => prev.filter((x) => x.id !== id));
    // selectedTask is derived from `tasks`, so it goes null here — which is
    // what triggers the drawer's exit. AnimatePresence keeps the last render
    // (task and all) on screen while it slides out, so no unmount race.
    if (selectedTaskId === id) setSelectedTaskId(null);
  }

  // Generic field updater for the TaskDetailDrawer. `TaskPatch` is the exact
  // body PATCH /tasks/:id accepts, so the drawer's patch reaches api.updateTask
  // with no cast. Flag toggling goes through api.flagTask directly because the
  // PATCH schema is `.strict()` and would reject `flagged`.
  async function updateTaskField(id: string, patch: TaskPatch) {
    const updated = await run(() => api.updateTask(id, patch), {
      fallback: "Failed to update task",
    });
    if (!updated) return;
    setTasks((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function setTaskKpis(id: string, bindings: BindingDraft[]) {
    const updated = await run(() => api.setTaskKpis(id, bindings), {
      fallback: "Failed to update KPI weights",
    });
    if (!updated) return;
    setTasks((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  function openTask(id: string) {
    setSelectedTaskId(id);
  }

  function closeDrawer() {
    setSelectedTaskId(null);
  }

  const selectedTask = useMemo(
    () => (selectedTaskId ? (tasks.find((t) => t.id === selectedTaskId) ?? null) : null),
    [selectedTaskId, tasks]
  );

  const visibleByGroup = useMemo(() => {
    const buckets: Record<GroupId, Task[]> = { todo: [], in_progress: [], done: [], canceled: [] };
    let filtered = tasks;
    if (filter === "active") {
      filtered = filtered.filter((t) => t.status !== "done" && t.status !== "canceled");
    } else if (filter === "today") {
      filtered = filtered.filter((t) => t.due_date && isToday(t.due_date));
    } else if (filter === "week") {
      filtered = filtered.filter((t) => t.due_date && isThisWeek(t.due_date));
    } else if (filter === "done") {
      filtered = filtered.filter((t) => t.status === "done");
    }
    for (const t of filtered) {
      buckets[t.status].push(t);
    }
    if (sort === "priority") {
      for (const k of GROUP_IDS) {
        buckets[k] = [...buckets[k]].sort(
          (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        );
      }
    } else if (sort === "due") {
      for (const k of GROUP_IDS) {
        buckets[k] = [...buckets[k]].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        });
      }
    }
    return buckets;
  }, [tasks, filter, sort]);

  const visibleGroups = useMemo(() => {
    if (filter === "active") return GROUPS.filter((g) => g.id !== "done");
    if (filter === "done") return GROUPS.filter((g) => g.id === "done");
    return GROUPS;
  }, [filter]);

  const totalTasks = tasks.length;
  const totalVisible = useMemo(
    () => Object.values(visibleByGroup).reduce((acc, list) => acc + list.length, 0),
    [visibleByGroup]
  );

  if (bootError) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <p className="text-[var(--color-danger-ink)]">{bootError.message}</p>
      </div>
    );
  }

  if (!teamId || loading) {
    return <p className="py-12 text-center text-[var(--color-ink-faint)]">Loading…</p>;
  }

  return (
    // The page lives inside AppShell's <main>, which adds pt-4 + pb-16
    // (pt-[4rem] on small screens) — so lock to viewport MINUS that
    // padding instead of raw h-screen, otherwise the body scrolls and
    // the drawer's bottom lands below the fold. Scroll lives inside the
    // task list (when many tasks) — not in the drawer, not on the page.
    <div className="flex h-[calc(100dvh-5rem)] max-[800px]:h-[calc(100dvh-8rem)] flex-col overflow-hidden">
      {/* Top bar: breadcrumb + actions */}
      <PageHeader>Tasks</PageHeader>

      {/* Filter row */}
      <BoardToolbar filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} />

      <ErrorBanner className="mb-3" message={error?.message} />

      {/* Tasks list + task-detail drawer share a horizontal row. The row is
          a size container (`@container`) so the drawer's `cqw` width
          resolves against the row — not the animating drawer wrapper.
          items-start keeps the task card at its natural (capped) height
          while the drawer wrapper self-stretches to the row bottom.
          Page is locked to viewport (see <div> above); the row fills the
          remaining height with flex-1 + min-h-0. The task card has a
          bounded max-h and scrolls internally. No page-level scroll, no
          drawer scroll. */}
      <div className="@container flex min-h-0 flex-1 items-start overflow-hidden">
        <TaskBoard
          totalTasks={totalTasks}
          totalVisible={totalVisible}
          filter={filter}
          visibleGroups={visibleGroups}
          visibleByGroup={visibleByGroup}
          collapsed={collapsed}
          toggleGroup={toggleGroup}
          projects={projects}
          openModal={openModal}
          openTask={openTask}
          toggleTask={toggleTask}
          cyclePriority={cyclePriority}
          toggleFlag={toggleFlag}
          removeTask={removeTask}
        />

        {/* Presence owns the mount lifetime, so `selectedTaskId` is the only
            drawer state: mount = open, unmount = slide back out. The old rig
            (a `drawerOpen` mirror, a 220ms unmount timer and a double
            requestAnimationFrame to make the first transition actually run)
            is gone — AnimatePresence keeps the last render on screen while it
            exits, and framer-motion starts from `initial` without a nudge.
            Width animates in % against the `@container` row, so "40%" is
            exactly the `40cqw` the inner card is sized in, with max-w-[640px]
            standing in for the `min()`. The `card` look stays on THIS wrapper:
            an element's own shadow isn't clipped by its overflow. */}
        <AnimatePresence>
          {selectedTask && (
            <motion.div
              key="task-drawer"
              initial="closed"
              animate="open"
              exit="closed"
              variants={{
                closed: { width: "0%", marginLeft: 0 },
                open: { width: "40%", marginLeft: 16 },
              }}
              transition={snap(DUR.panel)}
              className="card max-w-[640px] shrink-0 self-stretch overflow-hidden"
            >
              <TaskDetailDrawer
                task={selectedTask}
                currentUser={session.status === "authed" ? session.user : null}
                projects={projects}
                kpis={containerKpis}
                onClose={closeDrawer}
                onUpdate={(patch) => updateTaskField(selectedTask.id, patch)}
                onSetKpis={(bindings) => setTaskKpis(selectedTask.id, bindings)}
                onToggleFlag={() => toggleFlag(selectedTask)}
                onDelete={() => removeTask(selectedTask.id)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Presence owns the mount, which is what `if (!open) return null` used
          to do from inside. One gate, not two, so the modal can animate out. */}
      <AnimatePresence>
        {modalOpen && (
          <NewTaskModal
            title={newTitle}
            setTitle={setNewTitle}
            description={newDescription}
            setDescription={setNewDescription}
            priority={newPriority}
            setPriority={setNewPriority}
            status={newStatus}
            setStatus={setNewStatus}
            dueDate={newDueDate}
            setDueDate={setNewDueDate}
            projects={projects}
            kpis={containerKpis.filter((k) => k.owner_id === currentUserId)}
            projectId={newProjectId}
            setProjectId={setNewProjectId}
            kpiBindings={newKpis}
            setKpiBindings={setNewKpis}
            assigneeId={newAssigneeId}
            setAssigneeId={setNewAssigneeId}
            currentUserId={currentUserId}
            subtasks={newSubtasks}
            setSubtasks={setNewSubtasks}
            files={newFiles}
            setFiles={setNewFiles}
            creating={creating}
            onSubmit={createTaskFromModal}
            onClose={resetAndCloseModal}
            onKeyDown={onModalKey}
          />
        )}
      </AnimatePresence>

      {/* PRD-13: the first-run tour. Mounted here rather than in AppShell so it
          can wait on this page's own `boardReady` — see the comment on the
          component. It decides for itself whether to appear (session, route,
          viewport, dismissal). */}
      <TourOverlay boardReady={boardReady} />
    </div>
  );
}

// ---- PRD-06 binding chips -------------------------------------------------

// PATCH-safe patch shape lives in lib/api.ts as `TaskPatch` — it mirrors the
// backend's updateTaskSchema keys and is what api.updateTask now accepts, so
// the drawer and the client can no longer disagree about `description: null`.

// ============================================================================
// Comments (PRD-03). Phase 1 is REST-only; Phase 3 layers live SSE updates
// onto CommentsSection without changing its public surface.
// ============================================================================

// ---- PRD-11 Phase 1.2: the task checklist -------------------------------

// ---- PRD-11 Phase 1.3: files on a task ----------------------------------
