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
  due_date: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
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

export type ApiError = {
  error: string;
  message: string;
  status: number;
};

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "error" in e && "message" in e && "status" in e;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
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
    throw payload;
  }
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
  createTeam: (data: { name: string }) =>
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
    }
  ) =>
    req<Task>(`/teams/${teamId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
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
