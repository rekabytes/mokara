"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAtom, useSetAtom } from "jotai";
import { containerMembersAtom, GROUPS, GROUP_IDS, PRIORITY_RANK } from "./board-model";
import { asBoardTask, isThisWeek, isToday } from "./task-format";
import { api, type Task, type GitHubRepository } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";
import { useTaskMutations } from "./use-task-mutations";
import { useContainerMeta } from "@/lib/meta";
import { useSession } from "@/lib/session";
import { onSse } from "@/lib/sse";
import { taskFilterAtom, taskSortAtom, useCollapsedGroups, type GroupId } from "@/lib/tasksView";
import type { TourProgress } from "@/lib/onboarding";
import { DUR, snap, noMotion } from "@/lib/motion";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageHeader } from "@/components/PageHeader";
import { TourOverlay } from "@/components/TourOverlay";

import { NewTaskModal } from "./NewTaskModal";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { BoardToolbar, TaskBoard } from "./Board";
import { useNewTaskDraft } from "./use-new-task-draft";

export default function TasksPage() {
  const reduced = useReducedMotion();
  const session = useSession();
  // Owner rule (2026-09-05): KPI binding is personal — the chip only offers the
  // signed-in user's own KPIs, on both the modal and the drawer.
  const currentUserId = session.status === "authed" ? session.user.id : null;

  // PRD-06: the container comes from the global switcher atoms — no boot
  // fetch/effect here anymore. Containers failing is a boot-level error.
  const { selected, error: bootError } = useContainers();
  const teamId = selected?.id ?? null;
  const {
    projects,
    kpis: containerKpis,
    error: metaError,
    refresh: refreshMeta,
  } = useContainerMeta(selected?.id ?? null);
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
    publishToGitHub,
    setPublishToGitHub,
    githubRepositoryId,
    setGitHubRepositoryId,
    creating,
    createTaskFromModal,
    openModal,
    resetAndCloseModal,
    onModalKey,
  } = useNewTaskDraft({ teamId, run, setTasks });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [githubRepositories, setGitHubRepositories] = useState<GitHubRepository[]>([]);

  const { error: githubError, run: runGitHub, clearError: clearGitHubError } = useAsyncError();
  const githubRead = useRef<AbortController | null>(null);
  const loadGitHub = useCallback(async () => {
    githubRead.current?.abort();
    const controller = new AbortController();
    githubRead.current = controller;
    clearGitHubError();
    const result = await runGitHub(() => api.getGitHubIntegration(controller.signal), {
      signal: controller.signal,
      fallback: "Couldn't load repositories for task creation.",
    });
    if (result)
      setGitHubRepositories(
        !result.configured || result.connection?.reauthorization_required
          ? []
          : (result.connection?.repositories.filter(
              (repository) => repository.enabled && repository.available
            ) ?? [])
      );
  }, [runGitHub, clearGitHubError]);
  // Personal integration is external server state, independent of workspace.
  // Failure stays visible and retryable without blocking ordinary task work.
  useEffect(() => {
    void loadGitHub();
    return () => githubRead.current?.abort();
  }, [loadGitHub]);

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
  // instead — see lib/tasksView.ts.
  useEffect(() => {
    setTasks([]);
    setSelectedTaskId(null);
    setBoardReady(false);
    if (teamId) void loadTasks();
    else setLoading(false);
    return () => taskRead.current?.abort();
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

  const setContainerMembers = useSetAtom(containerMembersAtom);
  const { error: membersError, run: runMembers, clearError: clearMembersError } = useAsyncError();
  const membersRead = useRef<AbortController | null>(null);
  const loadMembers = useCallback(async () => {
    membersRead.current?.abort();
    const controller = new AbortController();
    membersRead.current = controller;
    clearMembersError();
    if (!teamId) return;
    const detail = await runMembers(() => api.getTeam(teamId, controller.signal), {
      signal: controller.signal,
      fallback: "Couldn't load workspace members.",
    });
    if (detail) setContainerMembers(detail.members);
  }, [teamId, setContainerMembers, runMembers, clearMembersError]);
  // Assignees are external membership data shared by both drawer chips.
  // Clear old workspace members immediately and cancel superseded reads.
  useEffect(() => {
    setContainerMembers([]);
    void loadMembers();
    return () => membersRead.current?.abort();
  }, [loadMembers, setContainerMembers]);

  const {
    toggleTask,
    cyclePriority,
    toggleFlag,
    removeTask,
    updateTaskField,
    setTaskKpis,
    retryGitHubIssue,
  } = useTaskMutations({ teamId, setTasks, setSelectedTaskId, run });

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

  // PRD-13: the walkthrough's only window into the app — everything the steps
  // wait on (the form opened, a task exists, a drawer is open) is state this
  // page already owns. Memoised so the overlay's advance effect re-runs when
  // the FACTS change, not on every keystroke in a form field.
  const tourProgress = useMemo<TourProgress>(
    () => ({
      taskCount: totalTasks,
      modalOpen,
      taskOpen: selectedTaskId !== null,
    }),
    [totalTasks, modalOpen, selectedTaskId]
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
      {membersError && (
        <div className="mb-3">
          <ErrorBanner message={membersError.message} />
          <button
            type="button"
            className="btn-base btn-ghost mt-2"
            onClick={() => void loadMembers()}
          >
            Retry members
          </button>
        </div>
      )}
      {githubError && (
        <div className="mb-3">
          <ErrorBanner message={githubError.message} />
          <button
            type="button"
            className="btn-base btn-ghost mt-2"
            onClick={() => void loadGitHub()}
          >
            Retry repositories
          </button>
        </div>
      )}
      {metaError && (
        <div className="mb-3">
          <ErrorBanner message={metaError.message} />
          <button
            type="button"
            className="btn-base btn-ghost mt-2"
            onClick={() => void refreshMeta()}
          >
            Retry projects &amp; KPIs
          </button>
        </div>
      )}

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
              transition={reduced ? noMotion : snap(DUR.panel)}
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
                onRetryGitHub={() => retryGitHubIssue(selectedTask)}
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
            githubRepositories={githubRepositories}
            publishToGitHub={publishToGitHub}
            setPublishToGitHub={setPublishToGitHub}
            githubRepositoryId={githubRepositoryId}
            setGitHubRepositoryId={setGitHubRepositoryId}
            creating={creating}
            onSubmit={createTaskFromModal}
            onClose={resetAndCloseModal}
            onKeyDown={onModalKey}
          />
        )}
      </AnimatePresence>

      {/* PRD-13: the first-run walkthrough. Mounted here rather than in AppShell
          so it can wait on this page's own `boardReady`, and so the steps can
          read this page's own state (the form being open, a task existing, a
          drawer open) instead of lifting any of it. It decides for itself
          whether to appear (session, route, viewport, dismissal). */}
      <TourOverlay boardReady={boardReady} progress={tourProgress} />
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
