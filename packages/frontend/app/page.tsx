"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Task, type TaskStatus } from "@/lib/api";

type Filter = "all" | TaskStatus;

const FILTERS: Filter[] = ["all", "todo", "in_progress", "done"];

const label = (s: string) => s.replace(/_/g, " ");

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
      const created = await api.create({ title: title.trim(), description: description.trim() });
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
    <main className="container">
      <h1>Tasks</h1>

      <form className="card form" onSubmit={create}>
        <input
          type="text"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">Add task</button>
      </form>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? "" : "secondary"}
            onClick={() => setFilter(f)}
          >
            {label(f)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && tasks.length === 0 && <p className="muted">No tasks yet.</p>}

      {tasks.map((t) => (
        <div key={t.id} className="card task">
          <div className="top">
            <strong style={{ textDecoration: t.status === "done" ? "line-through" : "none" }}>
              {t.title}
            </strong>
            <span className={`badge ${t.status}`}>{label(t.status)}</span>
          </div>
          {t.description && <p className="muted">{t.description}</p>}
          <div className="actions">
            <button className="secondary" onClick={() => toggle(t)}>
              {t.status === "done" ? "Mark todo" : "Mark done"}
            </button>
            <button className="danger" onClick={() => remove(t.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}
