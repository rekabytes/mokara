const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type NewTask = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  list: (status?: string) =>
    req<Task[]>(`/tasks${status ? `?status=${status}` : ""}`),
  create: (data: NewTask) =>
    req<Task>(`/tasks`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Task>) =>
    req<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) =>
    req<void>(`/tasks/${id}`, { method: "DELETE" }),
};
