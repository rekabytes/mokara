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
import { DateRangePicker } from "./DateRangePicker";
import { useRouter } from "next/navigation";
import {
  api,
  isApiError,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TeamWithRole,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

type Filter = "active" | "today" | "week" | "done";
type Sort = "manual" | "priority" | "due";
type GroupId = "todo" | "in_progress" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "done", label: "Done" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "priority", label: "Priority" },
  { id: "due", label: "Due date" },
];

const GROUPS: { id: GroupId; name: string }[] = [
  { id: "todo", name: "Todo" },
  { id: "in_progress", name: "In Progress" },
  { id: "done", name: "Done" },
];

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
  const router = useRouter();
  const session = useSession();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("manual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Set<GroupId>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [newDateRange, setNewDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [creating, setCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (session.status !== "authed") return;
    let cancelled = false;
    (async () => {
      try {
        const { teams } = await api.listTeams();
        if (cancelled) return;
        let team: TeamWithRole | undefined = teams[0];
        if (!team) {
          const created = await api.createTeam({ name: "Personal" });
          if (cancelled) return;
          team = { ...created.team, role: "owner" };
        }
        setTeamId(team.id);
      } catch (e: unknown) {
        if (!cancelled) {
          if (isApiError(e) && e.status === 401) {
            router.push("/login");
            return;
          }
          setBootError(isApiError(e) ? e.message : "Failed to load workspace");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.status, router]);

  const loadTasks = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTeamTasks(teamId);
      setTasks(list);
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 401) {
        router.push("/login");
        return;
      }
      setError(isApiError(e) ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [teamId, router]);

  useEffect(() => {
    if (teamId) loadTasks();
  }, [teamId, loadTasks]);

  async function createTaskFromModal() {
    if (!teamId) return;
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const created = await api.createTeamTask(teamId, {
        title,
        description: newDescription.trim() || undefined,
        priority: newPriority,
        status: newStatus,
        start_date: newDateRange.start ?? undefined,
        due_date: newDateRange.end ?? undefined,
      });
      setTasks((prev) => [created, ...prev]);
      resetAndCloseModal();
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  function openModal() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDateRange({ start: null, end: null });
    setModalOpen(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  function resetAndCloseModal() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDateRange({ start: null, end: null });
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
    try {
      const updated = await api.updateTask(t.id, { status: next });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to update task");
    }
  }

  async function cyclePriority(t: Task) {
    const order: TaskPriority[] = ["low", "medium", "high"];
    const next = order[(order.indexOf(t.priority) + 1) % order.length];
    try {
      const updated = await api.updateTask(t.id, { priority: next });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to update task");
    }
  }

  async function toggleFlag(t: Task) {
    try {
      const updated = await api.flagTask(t.id);
      setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to update task");
    }
  }

  async function removeTask(id: string) {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((x) => x.id !== id));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to delete task");
    }
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
  }

  async function commitEdit() {
    if (!editingId) return;
    const title = editTitle.trim();
    const id = editingId;
    setEditingId(null);
    if (!title) {
      removeTask(id);
      return;
    }
    const original = tasks.find((x) => x.id === id);
    if (original && original.title === title) return;
    try {
      const updated = await api.updateTask(id, { title });
      setTasks((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to rename task");
    }
  }

  function onEditKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingId(null);
    }
  }

  function toggleGroup(g: GroupId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  const visibleByGroup = useMemo(() => {
    const buckets: Record<GroupId, Task[]> = { todo: [], in_progress: [], done: [] };
    let filtered = tasks;
    if (filter === "active") {
      filtered = filtered.filter((t) => t.status !== "done");
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
      for (const k of Object.keys(buckets) as GroupId[]) {
        buckets[k] = [...buckets[k]].sort(
          (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        );
      }
    } else if (sort === "due") {
      for (const k of Object.keys(buckets) as GroupId[]) {
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
        <p className="text-[var(--color-danger-ink)]">{bootError}</p>
      </div>
    );
  }

  if (!teamId || loading) {
    return <p className="py-12 text-center text-[var(--color-ink-faint)]">Loading…</p>;
  }

  return (
    <div className="flex flex-col">
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
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-8 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <BellIcon />
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-[2px] rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-[3px] shadow-[var(--shadow-xs)] backdrop-blur-[22px]">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-[0.3rem] text-[0.82rem] font-medium transition-colors duration-[140ms]",
                  filter === f.id
                    ? "bg-white text-[var(--color-ink)] shadow-[0_1px_3px_rgba(15,23,42,0.1)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                )}
              >
                {f.label}
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
              onChange={(e) => setSort(e.target.value as Sort)}
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

      {error && (
        <div className="mb-3 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
          {error}
        </div>
      )}

      {/* Tasks card */}
      <div className="card overflow-hidden p-1.5">
        {totalTasks === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="relative mx-auto mb-3 block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
            <p className="m-0 text-[0.95rem] font-semibold">No tasks yet</p>
            <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
              Capture a thought, get it done.
            </p>
            <button type="button" onClick={openModal} className="btn-base btn-primary mt-[0.85rem]">
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
          </div>
        ) : (
          <div className="flex flex-col">
            {visibleGroups.map((g) => {
              const items = visibleByGroup[g.id];
              const isCollapsed = collapsed.has(g.id);
              if (items.length === 0) return null;
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
                        className="grid size-5 cursor-pointer place-items-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                      >
                        <PlusSmallIcon />
                      </button>
                    )}
                  </div>

                  {!isCollapsed && (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {items.map((t) => {
                        const done = t.status === "done";
                        return (
                          <TaskRow
                            key={t.id}
                            task={t}
                            done={done}
                            isEditing={editingId === t.id}
                            editTitle={editTitle}
                            setEditTitle={setEditTitle}
                            onToggle={() => toggleTask(t)}
                            onCyclePriority={() => cyclePriority(t)}
                            onToggleFlag={() => toggleFlag(t)}
                            onStartEdit={() => startEdit(t)}
                            onCommitEdit={commitEdit}
                            onEditKey={onEditKey}
                            onDelete={() => removeTask(t.id)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NewTaskModal
        open={modalOpen}
        title={newTitle}
        setTitle={setNewTitle}
        description={newDescription}
        setDescription={setNewDescription}
        priority={newPriority}
        setPriority={setNewPriority}
        status={newStatus}
        setStatus={setNewStatus}
        dateRange={newDateRange}
        setDateRange={setNewDateRange}
        creating={creating}
        titleInputRef={titleInputRef}
        onSubmit={createTaskFromModal}
        onClose={resetAndCloseModal}
        onKeyDown={onModalKey}
      />
    </div>
  );
}

function NewTaskModal({
  open,
  title,
  setTitle,
  description,
  setDescription,
  priority,
  setPriority,
  status,
  setStatus,
  dateRange,
  setDateRange,
  creating,
  titleInputRef,
  onSubmit,
  onClose,
  onKeyDown,
}: {
  open: boolean;
  title: string;
  setTitle: (s: string) => void;
  description: string;
  setDescription: (s: string) => void;
  priority: TaskPriority;
  setPriority: (p: TaskPriority) => void;
  status: TaskStatus;
  setStatus: (s: TaskStatus) => void;
  dateRange: { start: string | null; end: string | null };
  setDateRange: (r: { start: string | null; end: string | null }) => void;
  creating: boolean;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 grid place-items-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.75)] backdrop-blur-[2px]"
      />
      <div className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-white shadow-[var(--shadow-card)]">
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
              ref={titleInputRef}
              type="text"
              required
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
              {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => (
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
              {(["low", "medium", "high"] as TaskPriority[]).map((p) => (
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
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              trigger={(open, summary) => (
                <ChipShell open={open}>
                  <CalendarIcon />
                  <span
                    className={dateRange.start || dateRange.end ? "text-[var(--color-ink)]" : ""}
                  >
                    {summary}
                  </span>
                </ChipShell>
              )}
            />
            <button
              type="button"
              aria-label="More"
              className="grid size-7 cursor-pointer place-items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <DotsIcon />
            </button>
          </div>

          {/* Footer: attachment + Cancel + Create */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-4 py-2.5">
            <button
              type="button"
              aria-label="Add attachment"
              className="grid size-7 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <PaperclipIcon />
            </button>
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
      </div>
    </div>
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
  const margin = 4;

  const placeBelow = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + margin, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeBelow();
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest("[data-dropdown-menu]")) return;
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

  const menu =
    open && pos ? (
      <div
        data-dropdown-menu
        role="listbox"
        style={{ position: "fixed", top: pos.top, left: pos.left }}
        className="z-[60] overflow-hidden rounded-lg border border-[var(--color-border-soft)] bg-white py-1 whitespace-nowrap shadow-[var(--shadow-lift)]"
      >
        {children}
      </div>
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
      {typeof document !== "undefined" && menu && createPortal(menu, document.body)}
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
        {selected && (
          <svg
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
          </svg>
        )}
      </span>
    </button>
  );
}

function TaskRow({
  task,
  done,
  isEditing,
  editTitle,
  setEditTitle,
  onToggle,
  onCyclePriority,
  onToggleFlag,
  onStartEdit,
  onCommitEdit,
  onEditKey,
  onDelete,
}: {
  task: Task;
  done: boolean;
  isEditing: boolean;
  editTitle: string;
  setEditTitle: (s: string) => void;
  onToggle: () => void;
  onCyclePriority: () => void;
  onToggleFlag: () => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onEditKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "group mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-[120ms]",
        "hover:bg-[var(--color-surface-2)]",
        isEditing && "bg-[var(--color-surface-2)]"
      )}
    >
      <button
        onClick={onToggle}
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

      <button
        type="button"
        onClick={onCyclePriority}
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

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={onEditKey}
            className="w-full border-0 bg-transparent text-[0.92rem] font-medium text-[var(--color-ink)] outline-none"
          />
        ) : (
          <button
            onClick={onStartEdit}
            className={cn(
              "block w-full cursor-text truncate text-left text-[0.92rem] font-medium tracking-[-0.005em] transition-colors duration-[140ms]",
              done ? "text-[var(--color-ink-faint)] line-through" : "text-[var(--color-ink)]"
            )}
          >
            {task.title}
          </button>
        )}
      </div>

      {task.due_date && !isEditing && (
        <span className="shrink-0 font-mono text-[0.74rem] text-[var(--color-ink-faint)]">
          {formatDate(task.due_date)}
        </span>
      )}

      {/* Flag: always visible when active (so the red badge persists),
          otherwise hidden until row hover. No transition, no focus-within
          linger — click should feel decisive and the icon disappears
          immediately. */}
      <div
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
      <div className="flex shrink-0 items-center gap-[1px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
        <SmallIconButton label="Delete" onClick={onDelete} danger>
          <TrashIcon />
        </SmallIconButton>
      </div>
    </li>
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

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
