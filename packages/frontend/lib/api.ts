const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4200/api";
export type TaskStatus = "todo" | "in_progress" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  team_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: string | null;
  kpis: TaskKpiBinding[];
  due_date: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
};

// PRD-06: projects group tasks; KPIs measure them via weighted bindings.
export type ContainerScope = "team" | "personal";

export type Project = {
  id: string;
  team_id: string;
  owner_id: string;
  owner_username: string;
  scope: ContainerScope;
  name: string;
  color: string | null;
  archived: boolean;
  task_count: number;
  task_done_count: number;
  created_at: string;
  updated_at: string;
};

export type Kpi = {
  id: string;
  team_id: string;
  owner_id: string;
  owner_username: string;
  name: string;
  binding_count: number;
  created_at: string;
  updated_at: string;
};

export type TaskKpiBinding = { kpi_id: string; name: string; weight: number };

// PRD-06 phase 3: weighted progress per KPI (analytics card).
export type KpiProgress = {
  id: string;
  name: string;
  scope: ContainerScope;
  owner_username: string;
  task_count: number;
  weight_sum: number;
  progress: number; // 0–100
};

export type User = {
  id: string;
  username: string;
  display_name: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  // PRD-06: one container model, two states.
  kind: "workspace" | "team";
  member_count: number;
  created_at: string;
};

export type TeamWithRole = Team & { role: "owner" | "member" };

export type TeamMember = {
  user_id: string;
  username: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export type TeamInvitation = {
  id: string;
  team_id: string;
  team_name?: string;
  inviter_id: string;
  inviter_name?: string;
  invitee_username: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  author: User;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type AnalyticsSeriesItem = {
  date: string;
  created: number;
  in_progress: number;
  completed: number;
  canceled: number;
};

export type AnalyticsTotals = {
  open: number;
  in_progress: number;
  completed: number;
  canceled: number;
};

export type Analytics = {
  range: number;
  series: AnalyticsSeriesItem[];
  totals: AnalyticsTotals;
};

export type ProgressDueChange = {
  from_due: string | null;
  to_due: string | null;
  changed_at: string;
};

export type ProgressTask = {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  // When work actually started = first in_progress event (null = never
  // started). Start dates are not user-entered.
  started_at: string | null;
  due_date: string;
  completed_at: string | null;
  due_changes: ProgressDueChange[];
};

export type Progress = {
  tasks: ProgressTask[];
};

// Errors live in lib/errors.ts (shared with the useAsyncError hook); these
// re-exports keep `import { isApiError } from "@/lib/api"` working.
export { isApiError } from "@/lib/errors";
export type { ApiError } from "@/lib/errors";
import { ERROR_RULES, type ApiError } from "@/lib/errors";

// Mirrors the backend's request log so one call reads the same in both
// terminals (Next forwards browser console output to the dev terminal):
//   [api] GET /teams → 200 (4ms)
//   [api] POST /tasks → 403 (2ms) · forbidden "not a member of this team"
// Plain text, no %c styling, so the forwarded line stays readable.
function logCall(method: string, path: string, status: number, ms: number, detail?: string) {
  const line = `[api] ${method} ${path} → ${status} (${ms}ms)${detail ? ` · ${detail}` : ""}`;
  if (status === 0 || status >= 500) console.error(line);
  else if (status >= 400) console.warn(line);
  else console.log(line);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const start = Date.now();
  const done = (status: number, detail?: string) =>
    logCall(method, path, status, Date.now() - start, detail);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // fetch() itself rejected: server down, offline, CORS or DNS. Hand back the
    // same shape as every other failure so callers never special-case it.
    done(0, "network_error");
    throw {
      error: "network_error",
      message: `${ERROR_RULES.network_error.message} (${BASE})`,
      status: 0,
    } satisfies ApiError;
  }

  if (!res.ok) {
    let payload: ApiError = {
      error: "unknown",
      message: res.statusText || "Request failed",
      status: res.status,
    };
    try {
      const text = await res.text();
      if (text) {
        const parsed = JSON.parse(text);
        payload = { ...parsed, status: res.status };
      }
    } catch {
      /* keep default */
    }
    const detail = payload.error === "unknown" ? "" : `${payload.error} "${payload.message}"`;
    done(res.status, detail);
    throw payload;
  }
  done(res.status);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // ---- Auth ----
  signUp: (data: { username: string; password: string; display_name?: string }) =>
    req<{ user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    req<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () => req<void>("/auth/logout", { method: "POST" }),
  me: () => req<{ user: User }>("/me"),

  // ---- Teams ----
  createTeam: (data: { name: string; kind?: "workspace" | "team" }) =>
    req<{ team: Team }>("/teams", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listTeams: () => req<{ teams: TeamWithRole[] }>("/teams"),
  getTeam: (id: string) =>
    req<{
      team: Team;
      role: "owner" | "member";
      members: TeamMember[];
      invitations: TeamInvitation[];
    }>(`/teams/${id}`),
  leaveTeam: (id: string) => req<void>(`/teams/${id}/leave`, { method: "POST" }),
  inviteToTeam: (id: string, data: { username: string }) =>
    req<{ invitation: TeamInvitation }>(`/teams/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- Invitations ----
  listInvitations: () => req<{ invitations: TeamInvitation[] }>("/invitations"),
  respondToInvitation: (
    id: string,
    action: "accept" | "decline"
  ): Promise<{
    invitation_id: string;
    status: string;
    team_id?: string;
  }> =>
    req(`/invitations/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  // ---- Tasks (team-scoped) ----
  listTeamTasks: (teamId: string, status?: string) =>
    req<Task[]>(`/teams/${teamId}/tasks${status ? `?status=${status}` : ""}`),
  createTeamTask: (
    teamId: string,
    data: {
      title: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string;
      project_id?: string | null;
      kpis?: { kpi_id: string; weight: number }[];
    }
  ) =>
    req<Task>(`/teams/${teamId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- Projects & KPIs (PRD-06) ----
  listProjects: (teamId: string, all?: boolean) =>
    req<{ projects: Project[] }>(`/teams/${teamId}/projects${all ? "?all=1" : ""}`),
  createProject: (
    teamId: string,
    data: { name: string; color?: string | null; scope?: ContainerScope }
  ) =>
    req<{ project: Project }>(`/teams/${teamId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: { name?: string; color?: string | null; archived?: boolean }) =>
    req<{ project: Project }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) => req<void>(`/projects/${id}`, { method: "DELETE" }),
  listKpis: (teamId: string) => req<{ kpis: Kpi[] }>(`/teams/${teamId}/kpis`),
  createKpi: (teamId: string, data: { name: string }) =>
    req<{ kpi: Kpi }>(`/teams/${teamId}/kpis`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateKpi: (id: string, data: { name?: string }) =>
    req<{ kpi: Kpi }>(`/kpis/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteKpi: (id: string) => req<void>(`/kpis/${id}`, { method: "DELETE" }),
  getKpiProgress: (teamId: string) =>
    req<{ kpis: KpiProgress[] }>(`/teams/${teamId}/kpis/progress`),
  // Replace-all binding set for a task; [] clears.
  setTaskKpis: (id: string, kpis: { kpi_id: string; weight: number }[]) =>
    req<Task>(`/tasks/${id}/kpis`, { method: "PUT", body: JSON.stringify({ kpis }) }),
  updateTask: (id: string, data: Partial<Task>) =>
    req<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTask: (id: string) => req<void>(`/tasks/${id}`, { method: "DELETE" }),
  flagTask: (id: string) => req<Task>(`/tasks/${id}/flag`, { method: "POST" }),

  // ---- Comments ----
  listComments: (taskId: string) => req<{ comments: Comment[] }>(`/tasks/${taskId}/comments`),
  createComment: (taskId: string, body: string, parentId?: string) =>
    req<{ comment: Comment }>(`/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, ...(parentId ? { parent_id: parentId } : {}) }),
    }),
  updateComment: (id: string, body: string) =>
    req<{ comment: Comment }>(`/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id: string) => req<void>(`/comments/${id}`, { method: "DELETE" }),

  // ---- Analytics ----
  getAnalytics: (teamId: string, range: number) =>
    req<Analytics>(`/teams/${teamId}/analytics?range=${range}`),
  getProgress: (teamId: string) => req<Progress>(`/teams/${teamId}/progress`),
};
