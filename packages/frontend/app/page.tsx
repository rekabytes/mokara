"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Task, type TaskStatus } from "@/lib/api";

type Filter = "all" | TaskStatus;
const FILTERS: Filter[] = ["all", "todo", "in_progress", "done"];
const PRIORITY_CLASS: Record<string, string> = {
  high: "prio-high",
  medium: "prio-medium",
  low: "prio-low",
};

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await api.list(filter === "all" ? undefined : filter));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const created = await api.create({
        title: title.trim(),
        description: description.trim(),
      });
      setTasks((prev) => [created, ...prev]);
      setTitle("");
      setDescription("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  }

  async function toggle(t: Task) {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    try {
      const updated = await api.update(t.id, { status: next });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  async function remove(id: string) {
    try {
      await api.remove(id);
      setTasks((prev) => prev.filter((x) => x.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </div>
        <h1 className="title">Your tasks, calmly.</h1>
        <p className="subtitle">
          A minimal place to capture what matters and move it forward.
        </p>
      </header>

      <form className="card composer" onSubmit={create}>
        <input
          className="field title-field"
          type="text"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Task title"
        />
        <input
          className="field desc-field"
          type="text"
          placeholder="Add a note (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Task description"
        />
        <button
          className="btn primary add-btn"
          type="submit"
          disabled={!title.trim()}
        >
          <PlusIcon /> Add
        </button>
      </form>

      <div className="segmented" role="tablist" aria-label="Filter tasks">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`seg ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : titleCase(f)}
          </button>
        ))}
      </div>

      {error && <div className="alert">{error}</div>}
      {loading && <p className="empty">Loading…</p>}

      {!loading && tasks.length === 0 && (
        <div className="card empty-state">
          <div className="empty-illu" />
          <p className="empty-title">Nothing here yet</p>
          <p className="empty-sub">Add your first task above to get started.</p>
        </div>
      )}

      <ul className="task-list">
        {tasks.map((t) => {
          const done = t.status === "done";
          return (
            <li key={t.id} className={`card task ${done ? "is-done" : ""}`}>
              <button
                className={`check ${done ? "checked" : ""}`}
                onClick={() => toggle(t)}
                aria-label={done ? "Mark as not done" : "Mark as done"}
                aria-pressed={done}
              >
                <CheckIcon done={done} />
              </button>

              <div className="task-body">
                <span className="task-title">{t.title}</span>
                {t.description && (
                  <span className="task-desc">{t.description}</span>
                )}
                <div className="meta">
                  <span className={`pill status ${t.status}`}>
                    {titleCase(t.status)}
                  </span>
                  <span
                    className={`prio ${PRIORITY_CLASS[t.priority] ?? "prio-low"}`}
                  >
                    <span className="dot" />
                    {t.priority}
                  </span>
                  {t.due_date && (
                    <span className="due">· {formatDate(t.due_date)}</span>
                  )}
                </div>
              </div>

              <button
                className="icon-btn"
                onClick={() => remove(t.id)}
                aria-label="Delete task"
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="foot">Mokara · v1</footer>
    </main>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={done ? 1 : 0}
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
