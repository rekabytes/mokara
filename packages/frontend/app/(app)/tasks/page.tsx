"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { atom, useAtom } from "jotai";
import { DatePicker } from "./DatePicker";
import {
  api,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskPatch,
  type BindingDraft,
  type Comment,
  type User,
  type Project,
  type Kpi,
  type TeamMember,
  type UserRef,
  type SubtaskItem,
  type Attachment,
} from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainers } from "@/lib/containers";
import { useContainerMeta } from "@/lib/meta";
import { useSession } from "@/lib/session";
import { onSse } from "@/lib/sse";
import {
  taskFilterAtom,
  taskSortAtom,
  useCollapsedGroups,
  type GroupId,
  type TaskFilter,
  type TaskSort,
} from "@/lib/tasksView";
import {
  DUR,
  snap,
  popoverVariants,
  listItemVariants,
  collapseVariants,
  backdropVariants,
  sheetVariants,
  bannerVariants,
  tickVariants,
} from "@/lib/motion";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { TourOverlay } from "@/components/TourOverlay";
import { cn } from "@/lib/cn";

// PRD-10/11: members of the current container, shared by the drawer's and the
// create-modal's AssigneeChip. Written by the page-level fetch (outside React)
// so both read the same list — neither component fetches its own.
const containerMembersAtom = atom<TeamMember[]>([]);

// Gap between a trigger and the menu that opens under it, and the same number
// used by the drawer's width animation. Module scope so `placeBelow`'s
// useCallback can legitimately depend on nothing.
const MENU_GAP = 4;

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "done", label: "Done" },
];

const SORTS: { id: TaskSort; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "priority", label: "Priority" },
  { id: "due", label: "Due date" },
];

const GROUPS: { id: GroupId; name: string }[] = [
  { id: "todo", name: "Todo" },
  { id: "in_progress", name: "In Progress" },
  { id: "done", name: "Done" },
  { id: "canceled", name: "Canceled" },
];

// Derived from the data the page already has, so the dropdowns and the sort
// loops can list statuses/priorities without re-declaring (and re-casting) the
// same four/five literals in five places.
const GROUP_IDS: GroupId[] = GROUPS.map((g) => g.id);
const STATUS_IDS: TaskStatus[] = GROUP_IDS;
const PRIORITY_IDS: TaskPriority[] = ["low", "medium", "high"];

const PRIORITY_BAR_COLOR: Record<TaskPriority, string> = {
  high: "bg-[var(--color-prio-high)]",
  medium: "bg-[var(--color-prio-medium)]",
  low: "bg-[var(--color-ink-faint)]",
};

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

// Three ascending bars — fill count encodes priority (1/2/3), color encodes
// level. Used as a small inline indicator alongside the priority label.
function PriorityBars({ priority }: { priority: TaskPriority }) {
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const barColor = PRIORITY_BAR_COLOR[priority];
  return (
    <span
      className="inline-flex items-end gap-[2px] align-middle"
      role="img"
      aria-label={`Priority: ${priority}`}
    >
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[5px]",
          filled >= 1 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[7px]",
          filled >= 2 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
      <span
        className={cn(
          "w-[3px] rounded-[1px] h-[10px]",
          filled >= 3 ? barColor : "bg-[var(--color-border-soft)]"
        )}
      />
    </span>
  );
}

/**
 * Board-event payload guard (SSE). The wire contract is the server's shape()
 * output — byte-identical to what the REST task routes return — so this
 * validates the fields the board branches on (identity, routing, grouping,
 * and the two arrays the drawer chips read), not all fourteen. A frame that
 * fails it is ignored, never half-applied.
 */
function asBoardTask(v: unknown): Task | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id === "string" &&
    typeof o.team_id === "string" &&
    typeof o.title === "string" &&
    typeof o.status === "string" &&
    typeof o.priority === "string" &&
    Array.isArray(o.kpis) &&
    Array.isArray(o.subtasks)
  ) {
    return v as Task;
  }
  return null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const dow = now.getDay();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function shortId(t: Task): string {
  return t.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

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
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [newDueDate, setNewDueDate] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [newKpis, setNewKpis] = useState<BindingDraft[]>([]);
  // PRD-10: assignee at creation.
  const [newAssigneeId, setNewAssigneeId] = useState<string | null>(null);
  // PRD-11: steps and files are CREATION-TIME features — they are drafted here
  // and uploaded right after the task exists (two-phase, like comments).
  const [newSubtasks, setNewSubtasks] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

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

  async function createTaskFromModal(e: React.FormEvent) {
    // The submit button is a real <button type="submit"> inside a real <form>;
    // without preventDefault the browser navigates to /tasks?… the moment the
    // synchronous part of this handler finishes and aborts the upload chain
    // (createTask succeeds → row on board, but file uploads never run).
    e.preventDefault();
    if (!teamId) return;
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const created = await run(
      () =>
        api.createTeamTask(teamId, {
          title,
          description: newDescription.trim() || undefined,
          priority: newPriority,
          status: newStatus,
          due_date: newDueDate ?? undefined,
          project_id: newProjectId ?? undefined,
          assignee_id: newAssigneeId ?? undefined,
          kpis: newKpis.length ? newKpis : undefined,
        }),
      { fallback: "Failed to create task" }
    );
    if (!created) {
      setCreating(false);
      return;
    }

    // PRD-11: steps upload first (sequential appends land at positions 0..n-1),
    // then files — image and PDF only, enforced by the route.
    for (const step of newSubtasks) {
      await run(() => api.createSubtask(created.id, step), {
        fallback: "Failed to add a step",
      });
    }
    for (const file of newFiles) {
      await run(() => api.uploadAttachment(created.id, file), {
        fallback: "Failed to attach the file",
      });
    }

    // The created row predates its own steps/files — refetch so the board and
    // the drawer start from the complete payload.
    const fresh = await run(() => api.getTask(created.id), {
      fallback: "Failed to load the new task",
    });
    setCreating(false);
    // Only close the modal and add to the board when the refetch succeeds.
    // On failure the error stays visible and the user can retry.
    if (!fresh) return;
    setTasks((prev) => [fresh, ...prev]);
    resetAndCloseModal();
  }

  function openModal() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDueDate(null);
    setNewProjectId(null);
    setNewKpis([]);
    setNewAssigneeId(null);
    setModalOpen(true);
  }

  function resetAndCloseModal() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDueDate(null);
    setNewProjectId(null);
    setNewKpis([]);
    setNewAssigneeId(null);
    setNewSubtasks([]);
    setNewFiles([]);
    setModalOpen(false);
  }

  function onModalKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      resetAndCloseModal();
    }
  }

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
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] py-1">
        <div className="flex items-center gap-[0.4rem] text-[0.92rem] font-semibold">
          <span className="text-[var(--color-ink-muted)]">Mokara</span>
          <span className="text-[var(--color-ink-faint)]">›</span>
          <span>Tasks</span>
          <button
            type="button"
            aria-label="Star"
            className="ml-1 grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
          >
            <StarIcon />
          </button>
        </div>
        <NotificationBell />
      </div>

      {/* Filter row */}
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          <div
            data-tour="board-controls"
            className="inline-flex items-center gap-[2px] rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-[3px] shadow-[var(--shadow-xs)] backdrop-blur-[22px]"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "relative cursor-pointer rounded-full px-3 py-[0.3rem] text-[0.82rem] font-medium transition-colors duration-[140ms]",
                  filter === f.id
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                )}
              >
                {/* One shared layoutId across the four pills: the white plate
                    travels to whichever filter is active instead of being
                    re-painted from scratch on the new one. */}
                {filter === f.id && (
                  <motion.span
                    layoutId="active-filter-plate"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.1)]"
                    transition={snap(DUR.base)}
                  />
                )}
                <span className="relative">{f.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Filter settings"
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-faint)] backdrop-blur-[22px] hover:text-[var(--color-ink)]"
          >
            <SettingsIcon />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <IconButton label="Filter">
            <FilterIcon />
          </IconButton>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => {
                // Guarded lookup instead of `e.target.value as Sort`: an
                // unexpected value can't smuggle itself into the atom.
                const next = SORTS.find((s) => s.id === e.target.value)?.id;
                if (next) setSort(next);
              }}
              aria-label="Sort"
              className="cursor-pointer appearance-none rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] py-[0.3rem] pl-3 pr-7 text-[0.82rem] font-medium text-[var(--color-ink-muted)] backdrop-blur-[22px] outline-none hover:text-[var(--color-ink)]"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <IconButton label="Layout">
            <LayoutIcon />
          </IconButton>
        </div>
      </div>

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
        <div className="card flex min-h-0 max-h-[calc(100dvh-12rem)] max-[800px]:max-h-[calc(100dvh-15rem)] flex-1 min-w-0 flex-col overflow-hidden">
          {/* Inner scrollable surface — only the task area scrolls. */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {totalTasks === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="relative mx-auto mb-3 block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
                <p className="m-0 text-[0.95rem] font-semibold">No tasks yet</p>
                <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
                  Capture a thought, get it done.
                </p>
                <button
                  type="button"
                  onClick={openModal}
                  data-tour="create-task"
                  className="btn-base btn-primary mt-[0.85rem]"
                >
                  Create your first task
                </button>
              </div>
            ) : totalVisible === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <p className="m-0 text-[0.95rem] font-semibold">
                  {filter === "done"
                    ? "Nothing finished yet"
                    : filter === "today"
                      ? "Nothing due today"
                      : filter === "week"
                        ? "Nothing due this week"
                        : "No open tasks"}
                </p>
                <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
                  Try a different filter or add a new one.
                </p>
                {/* The copy invites "add a new one" — the board's only other "+"
                    is the To-do group header, and this state renders when no
                    group is on screen at all. So the button has to be here. */}
                <button
                  type="button"
                  onClick={openModal}
                  data-tour="create-task"
                  className="btn-base btn-primary mt-[0.85rem]"
                >
                  New task
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                {visibleGroups.map((g) => {
                  const items = visibleByGroup[g.id];
                  const isCollapsed = collapsed.has(g.id);
                  // PRD-11: the To-do group STAYS on the board even when empty —
                  // its header carries the only "+" that opens New task, so it
                  // must never vanish (an in-progress-only board used to lose
                  // the ability to create anything). Other groups keep their
                  // hide-when-empty behaviour.
                  if (items.length === 0 && g.id !== "todo") return null;
                  return (
                    <div key={g.id} className="flex flex-col">
                      <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-[var(--color-surface-2)]">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="flex cursor-pointer items-center gap-1.5"
                        >
                          <svg
                            className={cn(
                              "size-3 text-[var(--color-ink-faint)] transition-transform duration-[140ms]",
                              isCollapsed && "-rotate-90"
                            )}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M6 9l6 6 6-6"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="text-[0.85rem] font-semibold tracking-[-0.005em] text-[var(--color-ink)]">
                            {g.name}
                          </span>
                          <span className="text-[0.82rem] text-[var(--color-ink-faint)]">
                            {items.length}
                          </span>
                        </button>
                        {g.id === "todo" && (
                          <button
                            type="button"
                            onClick={openModal}
                            aria-label="New task"
                            data-tour="create-task"
                            className="grid size-5 cursor-pointer place-items-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                          >
                            <PlusSmallIcon />
                          </button>
                        )}
                      </div>

                      {/* Collapse is measured by framer-motion (`height: "auto"`
                          in lib/motion.ts), which is the whole reason this
                          doesn't need a scrollHeight in an effect. */}
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.ul
                            key="rows"
                            variants={collapseVariants}
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            className="m-0 flex list-none flex-col overflow-hidden p-0"
                          >
                            {items.map((t) => {
                              const done = t.status === "done";
                              return (
                                <TaskRow
                                  key={t.id}
                                  task={t}
                                  done={done}
                                  project={
                                    t.project_id
                                      ? (projects.find((p) => p.id === t.project_id) ?? null)
                                      : null
                                  }
                                  onOpen={() => openTask(t.id)}
                                  onToggle={() => toggleTask(t)}
                                  onCyclePriority={() => cyclePriority(t)}
                                  onToggleFlag={() => toggleFlag(t)}
                                  onDelete={() => removeTask(t.id)}
                                />
                              );
                            })}
                            {/* The To-do group's empty state (it is the only group
                                that renders at zero). */}
                            {items.length === 0 && (
                              <li className="m-0 list-none px-2 py-1.5 text-[0.78rem] text-[var(--color-ink-faint)]">
                                Nothing queued yet.
                              </li>
                            )}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

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

function NewTaskModal({
  title,
  setTitle,
  description,
  setDescription,
  priority,
  setPriority,
  status,
  setStatus,
  dueDate,
  setDueDate,
  projects,
  kpis,
  projectId,
  setProjectId,
  kpiBindings,
  setKpiBindings,
  assigneeId,
  setAssigneeId,
  currentUserId,
  subtasks,
  setSubtasks,
  files,
  setFiles,
  creating,
  onSubmit,
  onClose,
  onKeyDown,
}: {
  title: string;
  setTitle: (s: string) => void;
  description: string;
  setDescription: (s: string) => void;
  priority: TaskPriority;
  setPriority: (p: TaskPriority) => void;
  status: TaskStatus;
  setStatus: (s: TaskStatus) => void;
  dueDate: string | null;
  setDueDate: (iso: string | null) => void;
  projects: Project[];
  kpis: Kpi[];
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  kpiBindings: BindingDraft[];
  setKpiBindings: (b: BindingDraft[]) => void;
  // PRD-10: assignee at creation, offered from the shared members atom.
  assigneeId: string | null;
  setAssigneeId: (id: string | null) => void;
  currentUserId: string | null;
  // PRD-11: steps and files exist only at creation — drafted here, uploaded
  // after the task exists.
  subtasks: string[];
  setSubtasks: (steps: string[]) => void;
  files: File[];
  setFiles: (f: File[]) => void;
  creating: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  // Local draft for the step input; the committed list is the parent's state.
  const [stepDraft, setStepDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // PRD-10: assignee at creation. Members come from the shared container atom
  // (page-level fetch) — the modal runs no fetch of its own.
  const [members] = useAtom(containerMembersAtom);
  const assigneeMember = members.find((m) => m.user_id === assigneeId) ?? null;

  function commitStep() {
    const step = stepDraft.trim();
    if (!step) return;
    setSubtasks([...subtasks, step]);
    setStepDraft("");
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-title"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 grid place-items-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.75)] backdrop-blur-[2px]"
      />
      {/* No initial/animate: it inherits the scrim's variant labels, so the
          card lifts into place while the backdrop fades — and both reverse on
          close from one presence check. */}
      <motion.div
        variants={sheetVariants}
        className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-white shadow-[var(--shadow-card)]"
      >
        {/* Top bar: breadcrumb + actions */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[0.85rem] font-semibold">
            <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
            <span className="text-[var(--color-ink-muted)]">Mokara</span>
            <span className="text-[var(--color-ink-faint)]">›</span>
            <span id="new-task-title">New task</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Expand"
              className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <CloseSmallIcon />
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          {/* Body: title + description */}
          <div className="px-4 pt-3 pb-2">
            <input
              type="text"
              required
              // Declarative focus: the modal now mounts inside AnimatePresence,
              // so autoFocus replaces the rAF(focus()) that openModal used to
              // need to wait for a render that no longer exists.
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border-0 bg-transparent text-[1.05rem] font-medium text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:bg-transparent focus:shadow-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description…"
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border-0 bg-transparent text-[0.9rem] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
            />
          </div>

          {/* Chip row: status, priority, due date, more */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
            <Dropdown
              trigger={(open) => (
                <ChipShell open={open}>
                  <MinWidthChip
                    icon={<StatusDot status="in_progress" />}
                    longestLabel={STATUS_LABEL.in_progress}
                  >
                    <StatusDot status={status} />
                    <span>{STATUS_LABEL[status]}</span>
                  </MinWidthChip>
                  <ChevronIcon />
                </ChipShell>
              )}
            >
              {STATUS_IDS.map((s) => (
                <MenuItem
                  key={s}
                  selected={s === status}
                  icon={<StatusDot status={s} />}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </MenuItem>
              ))}
            </Dropdown>
            <Dropdown
              trigger={(open) => (
                <ChipShell open={open}>
                  <MinWidthChip icon={<PriorityBars priority="medium" />} longestLabel="Medium">
                    <PriorityBars priority={priority} />
                    <span className="capitalize">{priority}</span>
                  </MinWidthChip>
                  <ChevronIcon />
                </ChipShell>
              )}
            >
              {PRIORITY_IDS.map((p) => (
                <MenuItem
                  key={p}
                  selected={p === priority}
                  icon={<PriorityBars priority={p} />}
                  onClick={() => setPriority(p)}
                >
                  <span className="capitalize">{p}</span>
                </MenuItem>
              ))}
            </Dropdown>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              trigger={(open, summary) => (
                <ChipShell open={open}>
                  <CalendarIcon />
                  <span className={dueDate ? "text-[var(--color-ink)]" : ""}>{summary}</span>
                </ChipShell>
              )}
            />
            {/* PRD-10: assignee at creation — the same inline chip as the
                drawer. Members come from the shared Jotai atom (page-level
                fetch); the modal never fetches. */}
            <AssigneeChip
              members={members}
              creator={null}
              value={
                assigneeMember
                  ? {
                      id: assigneeMember.user_id,
                      username: assigneeMember.username,
                      display_name: assigneeMember.display_name,
                    }
                  : null
              }
              currentUserId={currentUserId}
              onChange={setAssigneeId}
            />

            {/* The "…" — project and KPIs fold in here, identical to the
                drawer's panel; each chip still opens its own menu inside. */}
            <Dropdown
              trigger={(open) => (
                <ChipShell open={open}>
                  <DotsIcon />
                  <ChevronIcon />
                </ChipShell>
              )}
            >
              <div className="flex flex-col items-start gap-1 p-1.5">
                <ProjectChip projects={projects} value={projectId} onChange={setProjectId} />
                {/* kpis arrive pre-filtered to the actor's own — binding is
                    personal. */}
                <KpiChip kpis={kpis} value={kpiBindings} onChange={setKpiBindings} />
              </div>
            </Dropdown>
          </div>

          {/* Steps — creation-time checklist (PRD-11). Drafted here; uploaded
              right after the task exists. */}
          <div className="px-4 pb-3">
            <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Steps
            </p>
            {subtasks.length > 0 && (
              <div className="mb-1.5 flex flex-col gap-1">
                {subtasks.map((step, i) => (
                  <span
                    key={`${step}-${i}`}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--color-surface)] px-2 py-1 text-[0.8rem] text-[var(--color-ink)]"
                  >
                    <span className="font-mono text-[0.7rem] text-[var(--color-ink-faint)]">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate">{step}</span>
                    <button
                      type="button"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                      className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                    >
                      <CloseSmallIcon />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitStep();
                  }
                }}
                placeholder="Add a step…"
                maxLength={200}
                aria-label="New step"
                className="field min-w-0 flex-1 px-2 py-1 text-[0.82rem]"
              />
              <button
                type="button"
                onClick={commitStep}
                disabled={!stepDraft.trim()}
                aria-label="Add step"
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:cursor-default disabled:opacity-40"
              >
                <PlusSmallIcon />
              </button>
            </div>
          </div>

          {/* Attached files — removable until Create; image and PDF only. */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="flex max-w-full items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink-muted)]"
                >
                  <PaperclipIcon />
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                  >
                    <CloseSmallIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Footer: attachment + Cancel + Create */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              {/* PRD-11: files exist only at creation — image and PDF only,
                  enforced by the route. The paperclip here was a dead button
                  before; it opens the picker now. */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach an image or PDF"
                className="grid size-7 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <PaperclipIcon />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files;
                  if (picked && picked.length > 0) {
                    setFiles([...files, ...Array.from(picked)]);
                  }
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
                  {files.length} file{files.length === 1 ? "" : "s"} attached
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-base btn-ghost"
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-base btn-primary"
                style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem" }}
                disabled={!title.trim() || creating}
              >
                {creating ? "Creating…" : "Create task"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return (
      <span className="grid size-[14px] place-items-center text-[var(--color-accent)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8.5 12.5l2.5 2.5L16 9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="grid size-[14px] place-items-center text-[var(--color-warning)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeDasharray="22 14"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="grid size-[14px] place-items-center">
      <span className="block size-[13px] rounded-full border-[1.8px] border-[var(--color-ink-faint)]" />
    </span>
  );
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};

function ChipShell({ open = false, children }: { open?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] font-medium transition-colors duration-[140ms]",
        open
          ? "border-[var(--color-border-strong)] bg-white text-[var(--color-ink)] shadow-[0_1px_3px_rgba(15,23,42,0.1)]"
          : "border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="text-[var(--color-ink-faint)]"
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Renders children inside a grid cell that's sized by an invisible copy of
// the icon + longest label — so the chip width never shrinks below the
// widest option, including the icon width.
function MinWidthChip({
  icon,
  longestLabel,
  children,
}: {
  icon: React.ReactNode;
  longestLabel: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-grid items-center">
      <span
        aria-hidden
        className="invisible pointer-events-none col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        {icon}
        <span>{longestLabel}</span>
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-center gap-1.5 whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}

function Dropdown({
  trigger,
  children,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const placeBelow = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + MENU_GAP, left: r.left });
  }, []);

  // Outside-React sync — document/window listeners plus a rect measurement —
  // so this is one of the effects that legitimately stays. It only owns
  // "where is the trigger" and "who clicked elsewhere"; the menu's appearance
  // is framer-motion's problem, not a re-render's.
  useEffect(() => {
    if (!open) return;
    placeBelow();
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-dropdown-menu]")) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => placeBelow();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, placeBelow]);

  // `pos` is left set when the menu closes: the exiting frame reuses the last
  // measurement, which is what keeps the fade from flashing at the top-left
  // corner. Nulling it here would move the element mid-exit.
  const menu =
    open && pos ? (
      <motion.div
        key="dropdown-menu"
        data-dropdown-menu
        role="listbox"
        variants={popoverVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        style={{ position: "fixed", top: pos.top, left: pos.left }}
        className="z-[60] overflow-hidden rounded-lg border border-[var(--color-border-soft)] bg-white py-1 whitespace-nowrap shadow-[var(--shadow-lift)]"
      >
        {children}
      </motion.div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) placeBelow();
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cursor-pointer"
      >
        {trigger(open)}
      </button>
      {/* AnimatePresence has to wrap the portal call itself: the menu is not a
          DOM descendant of this component, so no ancestor presence-check can
          see it unmount. */}
      {typeof document !== "undefined" &&
        createPortal(<AnimatePresence>{menu}</AnimatePresence>, document.body)}
    </>
  );
}

function MenuItem({
  selected,
  icon,
  onClick,
  children,
}: {
  selected: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      // 2-column grid: column 1 is text (1fr), column 2 is a fixed 18px
      // slot reserved for the checkmark. Because every row always
      // accounts for the checkmark column, the menu container's width is
      // anchored to (longest text + checkmark) — selecting a shorter row
      // doesn't shrink the menu.
      //
      // Hover background: a simple background-color change with a smooth
      // transition. The checkmark is the only indicator for selected
      // rows; the indigo tint appears only on hover of unselected rows.
      // (Custom rgba used to dial the opacity lower than --color-accent-soft
      //  so it reads as a subtle hover hint, not a strong selection mark.)
      className={cn(
        "grid w-full cursor-pointer grid-cols-[1fr_18px] items-center gap-2 px-3 py-[0.4rem] text-left text-[0.82rem] transition-colors duration-200 ease-out",
        selected
          ? "text-[var(--color-ink)]"
          : "text-[var(--color-ink)] hover:bg-[rgba(99,102,241,0.06)]"
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>{children}</span>
      </span>
      <span className="flex items-center justify-center">
        {/* The 18px checkmark column is reserved on every row (see the grid
            comment above), so the tick can scale in without shifting text. */}
        <AnimatePresence>
          {selected && (
            <motion.svg
              key="tick"
              variants={tickVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-[var(--color-accent)]"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

// ---- PRD-06 binding chips -------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-0.5 pt-2 text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-faint)]">
      {children}
    </div>
  );
}

function ProjectChip({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const current = projects.find((p) => p.id === value);
  // Archived projects are picked nowhere; they're managed on the team page.
  const live = projects.filter((p) => !p.archived);
  const team = live.filter((p) => p.scope === "team");
  const personal = live.filter((p) => p.scope === "personal");
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip icon={<ProjectIcon />} longestLabel="Project">
            <span>{current?.name ?? "Project"}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      <MenuItem selected={!value} onClick={() => onChange(null)}>
        No project
      </MenuItem>
      {team.length > 0 && <SectionLabel>Team</SectionLabel>}
      {team.map((p) => (
        <MenuItem key={p.id} selected={p.id === value} onClick={() => onChange(p.id)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? "var(--color-ink-faint)" }}
            />
            {p.name}
          </span>
        </MenuItem>
      ))}
      {personal.length > 0 && <SectionLabel>Personal</SectionLabel>}
      {personal.map((p) => (
        <MenuItem key={p.id} selected={p.id === value} onClick={() => onChange(p.id)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? "var(--color-ink-faint)" }}
            />
            {p.name} · {p.owner_username}
          </span>
        </MenuItem>
      ))}
      {projects.length === 0 && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          No projects yet — create them on the team page.
        </p>
      )}
    </Dropdown>
  );
}

// PRD-10: assignee picker — any container member, clearable to Unassigned.
// The creator (owner) is shown as a chip inside the menu and the leader gets
// an owner pill; selection follows the checkmark-only drawer convention.
function AssigneeChip({
  members,
  creator,
  value,
  currentUserId,
  onChange,
}: {
  members: TeamMember[];
  creator: UserRef | null;
  value: UserRef | null;
  currentUserId: string | null;
  onChange: (assigneeId: string | null) => void;
}) {
  const current = members.find((m) => m.user_id === value?.id);
  const label = current
    ? current.display_name || current.username
    : value
      ? value.display_name || value.username
      : "Unassigned";
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip
            icon={
              current || value ? (
                <span className="grid size-4 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.55rem] font-bold text-white">
                  {(
                    current?.display_name ||
                    current?.username ||
                    value?.display_name ||
                    value?.username ||
                    "?"
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )
            }
            longestLabel="Unassigned"
          >
            <span className="truncate">{label}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      <MenuItem selected={!value} onClick={() => onChange(null)}>
        Unassigned
      </MenuItem>
      {members.map((m) => (
        <MenuItem
          key={m.user_id}
          selected={m.user_id === value?.id}
          onClick={() => onChange(m.user_id)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="grid size-4 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.55rem] font-bold text-white">
              {(m.display_name || m.username).slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{m.display_name || m.username}</span>
            {m.user_id === currentUserId && (
              <span className="text-[var(--color-ink-faint)]">· you</span>
            )}
            {m.role === "owner" && <span className="text-[var(--color-ink-faint)]">· owner</span>}
          </span>
        </MenuItem>
      ))}
      {creator && !members.some((m) => m.user_id === creator.id) && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          Created by {creator.display_name || creator.username}
        </p>
      )}
    </Dropdown>
  );
}

function KpiChip({
  kpis,
  value,
  onChange,
}: {
  kpis: Kpi[];
  value: BindingDraft[];
  onChange: (next: BindingDraft[]) => void;
}) {
  const total = value.reduce((s, b) => s + b.weight, 0);
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip icon={<KpiIcon />} longestLabel="KPIs 100%">
            <span>{value.length > 0 ? `KPIs ${total}%` : "KPIs"}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      {kpis.length === 0 && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          None of your KPIs here yet — create one on the team page.
        </p>
      )}
      {kpis.map((k) => {
        const binding = value.find((b) => b.kpi_id === k.id);
        return (
          <div key={k.id} className="flex items-center gap-2 px-3 py-[0.3rem]">
            <button
              type="button"
              onClick={() =>
                binding
                  ? onChange(value.filter((b) => b.kpi_id !== k.id))
                  : onChange([...value, { kpi_id: k.id, weight: 25 }])
              }
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[0.82rem] text-[var(--color-ink)]"
            >
              <span
                className={cn(
                  "grid size-[14px] shrink-0 place-items-center rounded-[3px] border-[1.5px] text-transparent",
                  binding
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-border-strong)]"
                )}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="currentColor"
                    strokeWidth="3.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="truncate">
                {k.name}
                <span className="text-[var(--color-ink-faint)]"> · {k.owner_username}</span>
              </span>
            </button>
            {binding && (
              <input
                key={`${k.id}:${binding.weight}`}
                type="number"
                min={1}
                max={100}
                defaultValue={binding.weight}
                onBlur={(e) => {
                  const w = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                  onChange(value.map((b) => (b.kpi_id === k.id ? { ...b, weight: w } : b)));
                }}
                aria-label={`Weight for ${k.name}`}
                className="w-14 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right font-mono text-[0.76rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            )}
          </div>
        );
      })}
      {value.length > 0 && (
        <div
          className={cn(
            "border-t border-[var(--color-border-soft)] px-3 py-1.5 text-[0.72rem]",
            total > 100
              ? "font-semibold text-[var(--color-danger)]"
              : "text-[var(--color-ink-faint)]"
          )}
        >
          {total}% of 100%{total > 100 ? " — over budget" : ""}
        </div>
      )}
    </Dropdown>
  );
}

function ProjectIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5z" />
    </svg>
  );
}

function KpiIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4v2.5M12 17.5V20" strokeLinecap="round" />
    </svg>
  );
}

function TaskRow({
  task,
  done,
  project,
  onOpen,
  onToggle,
  onCyclePriority,
  onToggleFlag,
  onDelete,
}: {
  task: Task;
  done: boolean;
  project: Project | null;
  onOpen: () => void;
  onToggle: () => void;
  onCyclePriority: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.li
      onClick={onOpen}
      // `position`, not `layout`: rows glide to their new slot when the sort
      // or filter changes (today they teleport) without projecting a size,
      // which is what goes wrong inside an overflow-clipped scroll area.
      layout="position"
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        "group mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-[var(--color-surface-2)]"
      )}
    >
      {/* Checkbox — own click handler, stopPropagation so it doesn't open the drawer */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        aria-pressed={done}
        className={cn(
          "grid size-[15px] shrink-0 cursor-pointer place-items-center rounded-[3px] border-[1.5px] border-[var(--color-border-strong)] bg-transparent text-transparent transition-[background,border-color,transform,color] duration-[140ms] hover:border-[var(--color-accent)]",
          done && "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
        )}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Priority — own click handler, stopPropagation */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCyclePriority();
        }}
        aria-label={`Priority: ${task.priority}. Click to cycle.`}
        title={`Priority: ${task.priority} — click to cycle`}
        className="cursor-pointer rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-[rgba(99,102,241,0.06)]"
      >
        <PriorityBars priority={task.priority} />
      </button>

      <span className="w-[58px] shrink-0 select-none font-mono text-[0.74rem] tracking-[0.02em] text-[var(--color-ink-faint)]">
        {shortId(task)}
      </span>

      <StatusGlyph status={task.status} />

      {/* Title is now a static span — clicking the row opens the drawer */}
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block w-full truncate text-[0.92rem] font-medium tracking-[-0.005em] transition-colors duration-[140ms]",
            done ? "text-[var(--color-ink-faint)] line-through" : "text-[var(--color-ink)]"
          )}
        >
          {task.title}
        </span>
      </div>

      {(task.project_id || task.kpis.length > 0) && (
        <span className="flex shrink-0 max-w-[320px] items-center gap-2 text-[0.72rem] text-[var(--color-ink-faint)] max-[900px]:hidden">
          {project && (
            <span
              className="inline-flex min-w-0 items-center gap-1"
              title={`Project: ${project.name}`}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: project.color ?? "var(--color-ink-faint)" }}
              />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {task.kpis.map((k) => (
            <span
              key={k.kpi_id}
              className="inline-flex min-w-0 items-center gap-1"
              title={`${k.name}: ${k.weight}%`}
            >
              <KpiIcon />
              <span className="truncate">
                {k.name} {k.weight}%
              </span>
            </span>
          ))}
        </span>
      )}

      {task.assignee && (
        <span
          title={`Assigned to ${task.assignee.display_name || task.assignee.username}`}
          className="grid size-5 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.6rem] font-bold text-white"
        >
          {(task.assignee.display_name || task.assignee.username).slice(0, 1).toUpperCase()}
        </span>
      )}

      {task.due_date && (
        <span className="shrink-0 font-mono text-[0.74rem] text-[var(--color-ink-faint)]">
          {formatDate(task.due_date)}
        </span>
      )}

      {/* Flag: always visible when active (so the red badge persists),
          otherwise hidden until row hover. The wrapper stops click
          propagation so toggling the flag doesn't open the drawer. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "shrink-0",
          task.flagged ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <SmallIconButton
          label={task.flagged ? "Unflag" : "Flag for attention"}
          onClick={onToggleFlag}
          active={task.flagged}
        >
          <FlagIcon filled={task.flagged} />
        </SmallIconButton>
      </div>

      {/* Trash: always row-hover/focus-only. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-[1px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100"
      >
        <SmallIconButton label="Delete" onClick={onDelete} danger>
          <TrashIcon />
        </SmallIconButton>
      </div>
    </motion.li>
  );
}

function StatusGlyph({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return (
      <span className="grid size-[14px] shrink-0 place-items-center text-[var(--color-accent)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8.5 12.5l2.5 2.5L16 9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "canceled") {
    return (
      <span className="grid size-[14px] shrink-0 place-items-center text-[var(--color-danger)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8.5 8.5l7 7M15.5 8.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="grid size-[14px] shrink-0 place-items-center text-[var(--color-warning)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeDasharray="22 14"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="grid size-[14px] shrink-0 place-items-center">
      <span className="block size-[13px] rounded-full border-[1.8px] border-[var(--color-ink-faint)]" />
    </span>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-7 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
    >
      {children}
    </button>
  );
}

function SmallIconButton({
  label,
  onClick,
  children,
  danger,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white",
        active &&
          "border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
        !active && danger && "hover:text-[var(--color-danger)]",
        !active && !danger && "hover:text-[var(--color-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17.3 6.6 20l1.1-6L3.3 9.9l6-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h16M7 12h10M10 19h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PlusSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CloseSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5l-9 9a5.5 5.5 0 11-7.78-7.78l9-9a3.7 3.7 0 015.22 5.22l-9 9a1.85 1.85 0 11-2.62-2.62L14.7 6.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 10h17M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlagIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      {/* Pole */}
      <path d="M5 21V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Pennant — filled when the task is flagged, outlined otherwise */}
      <path
        d="M5 4 L13 7 L19 7 L19 13 L13 13 L5 10 Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// PATCH-safe patch shape lives in lib/api.ts as `TaskPatch` — it mirrors the
// backend's updateTaskSchema keys and is what api.updateTask now accepts, so
// the drawer and the client can no longer disagree about `description: null`.

function TaskDetailDrawer({
  task,
  currentUser,
  projects,
  kpis,
  onClose,
  onUpdate,
  onSetKpis,
  onToggleFlag,
  onDelete,
}: {
  task: Task;
  currentUser: User | null;
  projects: Project[];
  kpis: Kpi[];
  onClose: () => void;
  onUpdate: (patch: TaskPatch) => void;
  onSetKpis: (bindings: BindingDraft[]) => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  // ---- Title rename (double-click in drawer) ----
  // `titleEditing` is the only state here; the read-only branch renders
  // `task.title` and `startRename()` seeds the draft on the way in. The mirror
  // effect that used to copy `task.title` into `titleDraft` therefore only ever
  // ran while the draft was invisible — it was a useState->useState chain, not
  // a sync with anything outside React.
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ---- PRD-10/11: container members, read from the shared atom — the page
  // effect keeps the current container's list warm; the drawer manages no
  // member state of its own.
  const [members] = useAtom(containerMembersAtom);

  // ---- Due date: read straight off the task, persisted via PATCH on every
  //      change. DatePicker is fully controlled by `task.due_date`, so a
  //      server-side change lands on the chip with no mirroring (and no local
  //      copy to fall out of step). There is no start date: work starts when
  //      the status moves to in_progress. ----

  // ---- Global ESC closes the drawer, but only when no input/textarea is
  //      focused — inputs handle their own ESC semantics locally. A document
  //      keydown listener is outside React, so this effect stays. ----
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          // instanceof, not `as HTMLElement`: activeElement can be a node where
          // the cast would simply lie about isContentEditable existing.
          (active instanceof HTMLElement && active.isContentEditable))
      ) {
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startRename() {
    setTitleDraft(task.title);
    setTitleEditing(true);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }

  function commitRename() {
    setTitleEditing(false);
    const t = titleDraft.trim();
    if (!t || t === task.title) {
      setTitleDraft(task.title);
      return;
    }
    onUpdate({ title: t });
  }

  function cancelRename() {
    setTitleDraft(task.title);
    setTitleEditing(false);
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  return (
    <aside
      role="complementary"
      aria-label="Task detail"
      // Fixed width in container units (resolves against the row, not the
      // animating wrapper) + ml-auto pins the card to the wrapper's right
      // edge, so as the wrapper's width animates 0 → full the card slides
      // in from the right instead of squishing. Body is flex-1 +
      // overflow-hidden + line-clamped title/description — the drawer
      // never scrolls, regardless of task count. Visual card look (bg,
      // border, radius, shadow) comes from the wrapper.
      className="ml-auto flex h-full w-[min(40cqw,640px)] shrink-0 flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-2.5">
        <div className="flex items-center gap-2 text-[0.85rem]">
          <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
          <span className="text-[var(--color-ink-muted)]">Task</span>
          <span className="font-mono text-[0.76rem] tracking-[0.02em] text-[var(--color-ink-faint)]">
            {shortId(task)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <CloseSmallIcon />
        </button>
      </div>

      {/* Body — flex column: fixed title/description/chips/checklist up top,
          comments take the remaining height (shrink-0 on the checklist keeps
          that true however many steps exist). Title/description stay
          line-clamped. */}
      <div className="flex flex-1 flex-col overflow-hidden px-5 py-4">
        {/* Title — double-click to rename inline */}
        {titleEditing ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={onTitleKey}
            className="block w-full rounded-md border border-[var(--color-border-soft)] bg-white px-2 py-1.5 text-[1.3rem] font-semibold tracking-[-0.012em] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : (
          <h2
            onDoubleClick={startRename}
            title="Double-click to rename"
            className={cn(
              "cursor-text rounded-md px-1 py-0.5 -mx-1 text-[1.3rem] font-semibold tracking-[-0.012em] transition-colors duration-150 hover:bg-[var(--color-surface-2)] line-clamp-2",
              task.status === "done"
                ? "text-[var(--color-ink-faint)] line-through"
                : "text-[var(--color-ink)]"
            )}
          >
            {task.title}
          </h2>
        )}
        {task.creator && (
          <p className="m-0 mt-0.5 px-1 text-[0.72rem] text-[var(--color-ink-faint)]">
            Created by {task.creator.display_name || task.creator.username}
            {task.creator.id === currentUser?.id ? " (you)" : ""}
          </p>
        )}

        {/* Description — click to edit */}
        <DescriptionField
          value={task.description ?? ""}
          onSave={(text) => {
            const trimmed = text.trim();
            if (trimmed === (task.description ?? "")) return;
            onUpdate({ description: trimmed || null });
          }}
        />

        {/* Files — PRD-11, creation-time only. Part of the description area;
            renders nothing when the task has none. */}
        <AttachmentsSection key={`files-${task.id}`} taskId={task.id} currentUser={currentUser} />

        {/* Chip row — ONE line (owner): status / priority / due date / assignee
            stay inline; project, KPIs and flag fold into the "…" panel, which
            keeps them fully editable (each chip still opens its own menu). */}
        <div className="mt-5 flex items-center gap-1.5">
          <Dropdown
            trigger={(open) => (
              <ChipShell open={open}>
                <StatusGlyph status={task.status} />
                <span>{STATUS_LABEL[task.status]}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          >
            {STATUS_IDS.map((s) => (
              <MenuItem
                key={s}
                selected={s === task.status}
                icon={<StatusGlyph status={s} />}
                onClick={() => onUpdate({ status: s })}
              >
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </Dropdown>

          <Dropdown
            trigger={(open) => (
              <ChipShell open={open}>
                <PriorityBars priority={task.priority} />
                <span className="capitalize">{task.priority}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          >
            {PRIORITY_IDS.map((p) => (
              <MenuItem
                key={p}
                selected={p === task.priority}
                icon={<PriorityBars priority={p} />}
                onClick={() => onUpdate({ priority: p })}
              >
                <span className="capitalize">{p}</span>
              </MenuItem>
            ))}
          </Dropdown>

          <DatePicker
            value={task.due_date ?? null}
            onChange={(iso) =>
              // null clears the due date (undefined would be dropped by
              // JSON.stringify and leave the old value in place).
              onUpdate({ due_date: iso })
            }
            trigger={(open, summary) => (
              <ChipShell open={open}>
                <CalendarIcon />
                <span>{summary}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          />

          <AssigneeChip
            members={members}
            creator={task.creator}
            value={task.assignee}
            currentUserId={currentUser?.id ?? null}
            onChange={(assigneeId) => onUpdate({ assignee_id: assigneeId })}
          />

          {/* The "…" — everything below the owner's priority line lives here,
              still editable. */}
          <Dropdown
            trigger={(open) => (
              <ChipShell open={open}>
                <DotsIcon />
                <ChevronIcon />
              </ChipShell>
            )}
          >
            <div className="flex flex-col items-start gap-1 p-1.5">
              <ProjectChip
                projects={projects}
                value={task.project_id}
                onChange={(id) => onUpdate({ project_id: id })}
              />
              <KpiChip
                // Only the actor's own KPIs are offered; bindings teammates
                // made are frozen from here (the server preserves them).
                kpis={kpis.filter((k) => k.owner_id === currentUser?.id)}
                value={task.kpis.filter((b) =>
                  kpis.some((k) => k.owner_id === currentUser?.id && k.id === b.kpi_id)
                )}
                onChange={(next) =>
                  onSetKpis(next.map((b) => ({ kpi_id: b.kpi_id, weight: b.weight })))
                }
              />
              {/* Flag chip — uses onToggleFlag (POST /tasks/:id/flag), since
                  PATCH /tasks/:id is .strict() and rejects `flagged`. */}
              <button
                type="button"
                onClick={onToggleFlag}
                aria-pressed={task.flagged}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] font-medium transition-colors duration-150",
                  task.flagged
                    ? "border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    : "border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                )}
              >
                <FlagIcon filled={task.flagged} />
                <span>{task.flagged ? "Flagged" : "Flag"}</span>
              </button>
            </div>
          </Dropdown>
        </div>

        {/* Checklist — PRD-11 Phase 1.2: creation-time only, so this is a
            viewer for steps that exist. `key` remounts it per task so the
            seeded list can never bleed from one task to the next. */}
        <SubtasksSection key={task.id} task={task} />

        {/* Comments — fills remaining drawer height (PRD-03 Phase 1) */}
        <CommentsSection taskId={task.id} currentUser={currentUser} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-5 py-3">
        <span className="text-[0.74rem] text-[var(--color-ink-faint)]">
          Press{" "}
          <kbd className="rounded border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1 font-mono text-[0.7rem]">
            Esc
          </kbd>{" "}
          to close
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-[0.78rem] font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
        >
          <TrashIcon />
          Delete
        </button>
      </div>
    </aside>
  );
}

function DescriptionField({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  // Read-only branch shows `value`, `startEdit()` seeds the draft — so nothing
  // has to copy `value` into `draft` behind the scenes.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
    else setDraft(value);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        rows={3}
        placeholder="Add description…"
        className="mt-3 w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2.5 py-2 text-[0.92rem] leading-[1.5] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    );
  }

  return (
    <div
      onClick={startEdit}
      // line-clamp-3 keeps a long description from pushing the compact
      // drawer taller than its content-allocated height (no internal scroll).
      // whitespace-pre-wrap keeps the newlines typed in the textarea — HTML
      // collapses them to spaces otherwise, so a 3-line note rendered as one.
      className={cn(
        "mt-3 min-h-[2.25rem] cursor-text rounded-md px-2.5 py-1.5 -mx-2 whitespace-pre-wrap break-words text-[0.92rem] leading-[1.5] transition-colors duration-150 hover:bg-[var(--color-surface-2)] line-clamp-3",
        value ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"
      )}
    >
      {value || "Add description…"}
    </div>
  );
}

// ============================================================================
// Comments (PRD-03). Phase 1 is REST-only; Phase 3 layers live SSE updates
// onto CommentsSection without changing its public surface.
// ============================================================================

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

function avatarClass(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function timeAgo(iso: string, now: number): string {
  const mins = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function wasEdited(c: Comment): boolean {
  return Math.abs(Date.parse(c.updated_at) - Date.parse(c.created_at)) > 1000;
}

// ---- PRD-11 Phase 1.2: the task checklist -------------------------------

function SubtasksSection({ task }: { task: Task }) {
  // Seeded straight from the task payload — the checklist is embedded in every
  // task response — and the drawer mounts this per task with key={task.id}, so
  // no prop→state mirror effect is needed (house rule: seed, don't sync).
  // Steps are a CREATION-TIME feature (owner, 2026-09-05): the New task modal
  // adds them; this section only shows, ticks, renames, reorders and removes
  // what exists — and renders nothing at all when there are none.
  const [items, setItems] = useState<SubtaskItem[]>(task.subtasks);
  const { error, setError, run } = useAsyncError();

  const doneCount = items.filter((i) => i.done).length;

  async function toggle(item: SubtaskItem) {
    const done = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done } : i)));
    const res = await run(() => api.updateSubtask(item.id, { done }), {
      fallback: "Failed to update the step",
      onError: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !done } : i))),
    });
    if (!res) return;
    setError(null);
    setItems((prev) => prev.map((i) => (i.id === item.id ? res.subtask : i)));
  }

  async function rename(item: SubtaskItem, title: string) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === item.title) return;
    const prevTitle = item.title;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title: trimmed } : i)));
    const res = await run(() => api.updateSubtask(item.id, { title: trimmed }), {
      fallback: "Failed to rename the step",
      onError: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title: prevTitle } : i))),
    });
    if (!res) return;
    setError(null);
    setItems((prev) => prev.map((i) => (i.id === item.id ? res.subtask : i)));
  }

  async function remove(item: SubtaskItem) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    // DELETE resolves void → undefined, so test for null, not falsiness.
    const ok = await run(() => api.deleteSubtask(item.id), {
      fallback: "Failed to delete the step",
      onError: () => setItems(snapshot),
    });
    if (ok !== null) setError(null);
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const moved = items[index];
    const rest = items.filter((_, i) => i !== index);
    const next = [...rest.slice(0, target), moved, ...rest.slice(target)];
    setItems(next);
    // The whole order goes up every time: a dense 0..n-1 rewrite is cheaper to
    // reason about than patching two positions and hoping they land in order.
    const ok = await run(
      () =>
        api.orderSubtasks(
          task.id,
          next.map((i) => i.id)
        ),
      {
        fallback: "Failed to reorder the steps",
        // The array order is what we drew, so roll the whole list back.
        onError: () => setItems(items),
      }
    );
    if (ok !== null) setError(null);
  }

  // A task created without steps shows no checklist at all (owner: "if it
  // wasn't added, don't show"). Deleting the last step hides it again.
  if (items.length === 0) return null;

  return (
    <section className="mt-5 shrink-0" aria-label="Checklist">
      <div className="flex items-center gap-2">
        <h3 className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Checklist
        </h3>
        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-px text-[0.68rem] font-medium text-[var(--color-ink-faint)]">
          {doneCount}/{items.length}
        </span>
      </div>

      <div className="mt-1.5 max-h-[9rem] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              variants={listItemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout="position"
              className="group flex items-center gap-2 py-[0.22rem]"
            >
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={item.done}
                aria-label={item.done ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors duration-150",
                  item.done
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface-solid)] text-transparent hover:border-[var(--color-accent)]"
                )}
              >
                <AnimatePresence>
                  {item.done && (
                    <motion.svg
                      key="tick"
                      variants={tickVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12.5l4.5 4.5L19 7"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </button>

              {/* Title: contentEditable-free inline edit — a double-click
                    swaps in an input seeded with the current text, same
                    contract as the drawer's title/description fields. */}
              <SubtaskTitle value={item.title} onCommit={(next) => rename(item, next)} />

              <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                    className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-ink)]"
                  >
                    <MoveArrowIcon />
                  </button>
                )}
                {index < items.length - 1 && (
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                    className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-ink)]"
                  >
                    <MoveArrowIcon down />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label="Delete step"
                  className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-danger)]"
                >
                  <TrashIcon />
                </button>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && <p className="mt-1 text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>}
    </section>
  );
}

// One checklist row's text. Double-click to edit, Enter/blur commits, Esc
// cancels — the same contract the drawer's title uses, at row size.
function SubtaskTitle({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Double-click to rename"
        className={cn(
          "min-w-0 flex-1 cursor-text truncate rounded px-1 text-[0.85rem] transition-colors duration-150 hover:bg-[var(--color-surface-2)]",
          value.trim() === "" ? "text-[var(--color-ink-faint)] italic" : "text-[var(--color-ink)]"
        )}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          onCommit(draft);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      maxLength={200}
      aria-label="Step name"
      className="field min-w-0 flex-1 rounded px-1.5 py-0.5 text-[0.85rem]"
    />
  );
}

function MoveArrowIcon({ down = false }: { down?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={down ? "rotate-180" : undefined}
    >
      <path
        d="M12 19V5m0 0l-6 6m6-6l6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- PRD-11 Phase 1.3: files on a task ----------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function AttachmentsSection({ taskId, currentUser }: { taskId: string; currentUser: User | null }) {
  // Files are a CREATION-TIME feature (owner, 2026-09-05): the New task modal
  // uploads them right after the task exists, and this section — now part of
  // the description area — only ever SHOWS them. No composer, no drop zone:
  // post-creation images belong in comments. Hidden entirely when the task has
  // none; a failed load also renders as nothing (req() already logged it),
  // which is the honest reading of "don't show if none".
  const [files, setFiles] = useState<Attachment[] | null>(null);
  // Set by clicking an image; rendered as a full-screen preview (portal).
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const { error, setError, run } = useAsyncError();

  const load = useCallback(async () => {
    try {
      const res = await api.listAttachments(taskId);
      setFiles(res.attachments);
    } catch {
      setFiles(null); // an unloadable list reads as "no files" — logged in req()
    }
  }, [taskId]);

  // Server sync: load the list when the task changes (outside React).
  useEffect(() => {
    load();
  }, [load]);

  async function remove(file: Attachment) {
    const snapshot = files ?? [];
    setFiles(snapshot.filter((f) => f.id !== file.id));
    // DELETE resolves void → undefined, so test for null, not falsiness.
    const ok = await run(() => api.deleteAttachment(file.id), {
      fallback: "Failed to delete the file",
      onError: () => setFiles(snapshot),
    });
    if (ok !== null) setError(null);
  }

  // A task with no files renders nothing at all (owner: "don't show if none").
  if (!files || files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-start gap-1.5" aria-label="Files">
      {files.map((f) => {
        const mine = currentUser?.id === f.uploader.id;
        return (
          <div key={f.id} className="group relative">
            {isImage(f) ? (
              <button
                type="button"
                onClick={() => setViewing(f)}
                aria-label={`Preview ${f.filename}`}
                title={f.filename}
                className="block cursor-pointer"
              >
                <img
                  src={api.attachmentDownloadUrl(f.id)}
                  alt={f.filename}
                  className="size-14 rounded-[8px] border border-[var(--color-border-soft)] object-cover"
                />
              </button>
            ) : (
              <a
                href={api.attachmentDownloadUrl(f.id)}
                download={f.filename}
                title={`${f.filename} · ${formatBytes(f.size_bytes)}`}
                className="flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.2rem] text-[0.72rem] text-[var(--color-ink)] underline-offset-2 hover:bg-[var(--color-surface-2)] hover:underline"
              >
                <PaperclipIcon />
                <span className="max-w-[12rem] truncate">{f.filename}</span>
              </a>
            )}
            {/* PRD-11: only the uploader can remove a file — and with adding
                locked to creation time, deletion is permanent. */}
            {mine && (
              <button
                type="button"
                onClick={() => remove(f)}
                aria-label={`Delete ${f.filename}`}
                className="absolute -right-1.5 -top-1.5 grid size-[18px] cursor-pointer place-items-center rounded-full border border-[var(--color-border-soft)] bg-white text-[var(--color-ink-faint)] opacity-0 transition-opacity duration-150 hover:text-[var(--color-danger)] group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <CloseSmallIcon />
              </button>
            )}
          </div>
        );
      })}

      {error && <p className="w-full text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>}

      {/* Large view — shared with the comment thread (same component, same
          rules); one presence check so it animates out on close. */}
      <AttachmentLightbox attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

// Images get a thumbnail + large view; everything else is a row with a
// download link. The content type is the server's measurement of the bytes,
// not the browser's guess from the extension.
function isImage(a: Attachment): boolean {
  return a.content_type.startsWith("image/");
}

/**
 * The large view for any attachment, wherever it lives — task Files and the
 * comment thread share it so the experience is identical. Portal +
 * AnimatePresence is the NewTaskModal overlay idiom: one presence check,
 * backdrop fades while the sheet lifts, both reverse on close. Esc lives here
 * so every caller gets it for free (a keyboard listener is outside-React sync —
 * the one kind of effect this codebase allows).
 */
function AttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachment, onClose]);

  return createPortal(
    <AnimatePresence>
      {attachment && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${attachment.filename}`}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onClick={onClose}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.82)]"
          />
          <motion.figure
            variants={sheetVariants}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 max-w-[92vw] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-lift)]"
          >
            <img
              src={api.attachmentDownloadUrl(attachment.id)}
              alt={attachment.filename}
              className="max-h-[72dvh] max-w-[86vw] object-contain"
            />
            <figcaption className="flex items-center gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium text-[var(--color-ink)]">
                {attachment.filename}
              </span>
              <span className="shrink-0 font-mono text-[0.7rem] text-[var(--color-ink-faint)]">
                {formatBytes(attachment.size_bytes)} ·{" "}
                {attachment.uploader.display_name || attachment.uploader.username}
              </span>
              <a
                href={api.attachmentDownloadUrl(attachment.id)}
                download={attachment.filename}
                className="btn-base btn-primary shrink-0"
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.78rem" }}
              >
                Download
              </a>
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CommentsSection({ taskId, currentUser }: { taskId: string; currentUser: User | null }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { error: actionError, setError: setActionError, run } = useAsyncError();
  const [now, setNow] = useState(() => Date.now());
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // PRD-11: a clicked comment image opens the shared large view.
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Relative timestamps need a clock, so this is a real outside-React sync:
  // one 60s tick keeps "3m ago" honest without refetching. Both timers in this
  // component are of that kind — nothing here is a state-mirroring chain.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // A failed comment action announces itself for 4s. Timer again, so it stays;
  // it lives here rather than in ErrorBanner because this surface is the
  // drawer's compact inline notice, not one of the full-width block banners.
  useEffect(() => {
    if (!actionError) return;
    const id = setTimeout(() => setActionError(null), 4_000);
    return () => clearTimeout(id);
  }, [actionError, setActionError]);

  const load = useCallback(async () => {
    try {
      const res = await api.listComments(taskId);
      setComments(res.comments);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [taskId]);

  // Server sync: (re)load the thread when the task changes. Clearing `comments`
  // first is what makes the drawer show "Loading…" for the new task rather than
  // the previous task's discussion.
  useEffect(() => {
    setComments(null);
    load();
  }, [load]);

  // Keep the newest comment in view as the list grows. Writing scrollHeight is
  // imperative DOM work with no declarative equivalent, so this effect stays.
  const count = comments?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function submit(body: string, parentId?: string, files?: File[]) {
    if (!currentUser) return;
    setReplyTo(null);
    const iso = new Date().toISOString();
    // Optimistic insert — feels instant; reconciled (or rolled back) when the
    // request settles.
    const temp: Comment = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      task_id: taskId,
      author_id: currentUser.id,
      author: currentUser,
      parent_id: parentId ?? null,
      body,
      attachments: [],
      created_at: iso,
      updated_at: iso,
    };
    setComments((cs) => [...(cs ?? []), temp]);
    const res = await run(() => api.createComment(taskId, body, parentId), {
      fallback: "Failed to post comment",
      // Undo the optimistic insert; the hook already surfaced the failure.
      onError: () => setComments((cs) => (cs ?? []).filter((c) => c.id !== temp.id)),
    });
    if (!res) return;
    setComments((cs) => (cs ?? []).map((c) => (c.id === temp.id ? res.comment : c)));

    // PRD-11: the files upload AFTER the comment exists, one at a time, and
    // each one folds into that comment's embedded list as it lands — so an
    // image appears the moment its bytes are stored.
    for (const file of files ?? []) {
      const up = await run(() => api.uploadCommentAttachment(res.comment.id, file), {
        fallback: "Failed to attach the file",
      });
      if (up)
        setComments((cs) =>
          (cs ?? []).map((c) =>
            c.id === res.comment.id ? { ...c, attachments: [...c.attachments, up.attachment] } : c
          )
        );
    }
  }

  async function saveEdit(id: string, prevBody: string, body: string) {
    setComments((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, body } : c)));
    const res = await run(() => api.updateComment(id, body), {
      fallback: "Failed to save comment",
      onError: () =>
        setComments((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, body: prevBody } : c))),
    });
    if (res) setComments((cs) => (cs ?? []).map((c) => (c.id === id ? res.comment : c)));
  }

  async function remove(id: string) {
    const prev = comments ?? [];
    setReplyTo((r) => (r && (r.id === id || r.parent_id === id) ? null : r));
    // Mirror the DB cascade locally: deleting a comment drops its replies.
    setComments(prev.filter((c) => c.id !== id && c.parent_id !== id));
    await run(() => api.deleteComment(id), {
      fallback: "Failed to delete comment",
      onError: () => setComments(prev),
    });
  }

  // One level of threading: roots in arrival order, replies grouped under
  // their parent (the backend already flattens replies-to-replies to roots).
  const threads = useMemo(() => {
    const cs = comments ?? [];
    const roots = cs.filter((c) => c.parent_id === null);
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of cs) {
      if (!c.parent_id) continue;
      const arr = repliesByParent.get(c.parent_id);
      if (arr) arr.push(c);
      else repliesByParent.set(c.parent_id, [c]);
    }
    return { roots, repliesByParent };
  }, [comments]);

  return (
    <section className="mt-5 flex min-h-0 flex-1 flex-col" aria-label="Comments">
      <div className="flex items-center gap-2">
        <h3 className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Comments
        </h3>
        {count > 0 && (
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-px text-[0.68rem] font-medium text-[var(--color-ink-faint)]">
            {count}
          </span>
        )}
      </div>

      {/* The tall scroll region — the discussion can grow without bound while
          title/description/chips stay fixed above. (The checklist above has its
          own capped scroller since PRD-11; this is still the only region that
          grows with content.) */}
      <div ref={listRef} className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loadFailed && comments === null ? (
          <p className="text-[0.8rem] text-[var(--color-ink-faint)]">
            Couldn&apos;t load comments.{" "}
            <button
              type="button"
              onClick={load}
              className="cursor-pointer text-[var(--color-accent)] underline"
            >
              Retry
            </button>
          </p>
        ) : comments !== null && comments.length === 0 ? (
          <p className="text-[0.8rem] text-[var(--color-ink-faint)]">
            No comments yet. Start the conversation.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {threads.roots.map((c) => {
              const replies = threads.repliesByParent.get(c.id) ?? [];
              return (
                <motion.div
                  key={c.id}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <CommentRow
                    comment={c}
                    now={now}
                    isOwn={currentUser?.id === c.author_id}
                    onSave={(body) => saveEdit(c.id, c.body, body)}
                    onDelete={() => remove(c.id)}
                    onReply={() => setReplyTo(c)}
                    onPreview={setViewing}
                  />
                  {/* Replies fade in under their parent as a block; no `layout`
                      here — nested layout nodes inside this force-scrolled,
                      overflow-clipped list is where motion gets smeared. */}
                  <AnimatePresence initial={false}>
                    {replies.length > 0 && (
                      <motion.div
                        key="replies"
                        variants={listItemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="ml-3 mt-3 space-y-3 border-l border-[var(--color-border-soft)] pl-3.5"
                      >
                        {replies.map((r) => (
                          <CommentRow
                            key={r.id}
                            comment={r}
                            now={now}
                            isOwn={currentUser?.id === r.author_id}
                            replyToUsername={c.author.username}
                            onSave={(body) => saveEdit(r.id, r.body, body)}
                            onDelete={() => remove(r.id)}
                            onReply={() => setReplyTo(r)}
                            onPreview={setViewing}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Same failure the drawer used to print as a bare <p>, now with an exit:
          AnimatePresence owns unmounting, so `setActionError(null)` (the 4s
          timer above) fades it out instead of blanking it. */}
      <AnimatePresence initial={false}>
        {actionError && (
          <motion.p
            key="comment-error"
            variants={bannerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="mt-1.5 overflow-hidden text-[0.74rem] text-[var(--color-danger)]"
          >
            <span className="block">{actionError.message}</span>
          </motion.p>
        )}
      </AnimatePresence>

      {currentUser && (
        // `key` is what makes the composer's prefill declarative: changing the
        // reply target remounts it, so the @mention is its initial value and
        // autoFocus re-fires — no change-detecting effect.
        <CommentComposer
          key={replyTo?.id ?? "root"}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSubmit={submit}
        />
      )}

      {/* Same large view the task Files list uses — one component, one set of
          rules, two surfaces. */}
      <AttachmentLightbox attachment={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}

function CommentComposer({
  replyTo,
  onCancelReply,
  onSubmit,
}: {
  replyTo: Comment | null;
  onCancelReply: () => void;
  onSubmit: (body: string, parentId?: string, files?: File[]) => void;
}) {
  const [draft, setDraft] = useState(() =>
    // The mention is the initial value, not a value copied in later. Combined
    // with the `key` at the call site (which remounts this composer whenever
    // the reply target changes), that replaces an effect whose whole job was
    // "when replyTo changes, overwrite the draft and focus".
    replyTo ? `@${replyTo.author.username} ` : ""
  );
  // PRD-11: images and PDFs ride along with the text. They upload after the
  // comment exists, so they're held here as raw Files until submit.
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    // Threading is one level deep — replying to a reply targets the root.
    onSubmit(
      body,
      replyTo ? (replyTo.parent_id ?? replyTo.id) : undefined,
      files.length > 0 ? files : undefined
    );
    setDraft("");
    setFiles([]);
  }

  function cancelReply() {
    onCancelReply();
    setDraft("");
  }

  return (
    <div className="mt-2.5 border-t border-[var(--color-border-soft)] pt-2.5">
      {replyTo && (
        <div className="mb-1.5 flex items-center justify-between rounded-md bg-[var(--color-surface)] px-2.5 py-1.5">
          <span className="truncate text-[0.72rem] text-[var(--color-ink-muted)]">
            Replying to{" "}
            <span className="font-medium text-[var(--color-accent)]">
              @{replyTo.author.username}
            </span>
          </span>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={cancelReply}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <CloseSmallIcon />
          </button>
        </div>
      )}
      <textarea
        ref={taRef}
        // Only when replying — otherwise opening a task drawer would yank
        // focus into the comment box. Caret lands at the end of the seeded
        // mention, which is where the old setSelectionRange put it.
        autoFocus={replyTo !== null}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && replyTo) {
            e.preventDefault();
            cancelReply();
          }
        }}
        rows={2}
        placeholder={replyTo ? `Reply to @${replyTo.author.username}…` : "Add a comment…"}
        className="w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2.5 py-2 text-[0.85rem] leading-[1.5] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
      />
      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex max-w-full items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink-muted)]"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
              >
                <CloseSmallIcon />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          {/* PRD-11: images and PDFs ride along with the text; the route
              rejects anything else, so the picker narrows the obvious paths
              and the server stays the only judge. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach an image or PDF"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <PaperclipIcon />
          </button>
          <span>
            <kbd className="rounded border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1 font-mono text-[0.66rem]">
              ⌘
            </kbd>
            +Enter to post
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files;
            if (picked && picked.length > 0) {
              setFiles((prev) => [...prev, ...Array.from(picked)]);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="cursor-pointer rounded-full bg-[var(--color-accent)] px-3 py-1 text-[0.76rem] font-medium text-white disabled:cursor-default disabled:opacity-40"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  now,
  isOwn,
  replyToUsername,
  onSave,
  onDelete,
  onReply,
  onPreview,
}: {
  comment: Comment;
  now: number;
  isOwn: boolean;
  replyToUsername?: string;
  onSave: (body: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onPreview: (a: Attachment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);

  const name = comment.author.display_name || comment.author.username;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  function startEdit() {
    setDraft(comment.body);
    setEditing(true);
  }

  function commitEdit() {
    const body = draft.trim();
    setEditing(false);
    if (body && body !== comment.body) onSave(body);
    else setDraft(comment.body);
  }

  return (
    <article className="group flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.68rem] font-semibold",
          avatarClass(comment.author.username)
        )}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[0.8rem] font-medium text-[var(--color-ink)]">{name}</span>
          <span className="shrink-0 text-[0.7rem] text-[var(--color-ink-faint)]">
            {timeAgo(comment.created_at, now)}
            {wasEdited(comment) && " (edited)"}
          </span>
          {/* Row actions — revealed on hover, no fade (decisive). Reply is
              for everyone; edit/delete only on own comments. */}
          {!editing && (
            <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              {confirming ? (
                <span className="flex items-center gap-1 text-[0.7rem] text-[var(--color-danger)]">
                  Delete?
                  <button
                    type="button"
                    onClick={onDelete}
                    className="cursor-pointer font-medium underline"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="cursor-pointer text-[var(--color-ink-muted)] underline"
                  >
                    No
                  </button>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Reply to comment"
                    onClick={onReply}
                    className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  >
                    <ReplyIcon />
                  </button>
                  {isOwn && (
                    <>
                      <button
                        type="button"
                        aria-label="Edit comment"
                        onClick={startEdit}
                        className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => setConfirming(true)}
                        className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </>
              )}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(comment.body);
                  setEditing(false);
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEdit();
                }
              }}
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2 py-1.5 text-[0.83rem] leading-[1.5] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={commitEdit}
                disabled={!draft.trim()}
                className="cursor-pointer rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[0.72rem] font-medium text-white disabled:cursor-default disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
                className="cursor-pointer rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Linkage chip — makes the reply's parent explicit, not just
                implied by indentation. */}
            {replyToUsername && (
              <p className="mt-0.5 text-[0.7rem] text-[var(--color-ink-faint)]">
                ↳ replying to{" "}
                <span className="font-medium text-[var(--color-accent)]">@{replyToUsername}</span>
              </p>
            )}
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.83rem] leading-[1.5] text-[var(--color-ink)]">
              {comment.body}
            </p>
            {comment.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {comment.attachments.map((a) =>
                  isImage(a) ? (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPreview(a)}
                      aria-label={`Preview ${a.filename}`}
                      className="cursor-pointer"
                    >
                      <img
                        src={api.attachmentDownloadUrl(a.id)}
                        alt={a.filename}
                        className="size-14 rounded-[8px] border border-[var(--color-border-soft)] object-cover"
                      />
                    </button>
                  ) : (
                    <a
                      key={a.id}
                      href={api.attachmentDownloadUrl(a.id)}
                      download={a.filename}
                      title={a.filename}
                      className="flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink)] underline-offset-2 hover:bg-[var(--color-surface-2)] hover:underline"
                    >
                      <PaperclipIcon />
                      <span className="max-w-[16rem] truncate">{a.filename}</span>
                      <span className="shrink-0 font-mono text-[0.66rem] text-[var(--color-ink-faint)]">
                        {formatBytes(a.size_bytes)}
                      </span>
                    </a>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function ReplyIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
