// Same-origin by design: every request goes to /api/… on this Next server, which
// proxies it to the backend (app/api/[...path]/route.ts). The backend's real
// address is BACKEND_URL, a runtime value the proxy reads — never a NEXT_PUBLIC_*
// var, because those are baked into the browser bundle at build time and would
// pin a published image to one host.
const BASE = "/api";

// The domain types live in ./api-types. They are IMPORTED for the method
// signatures below and RE-EXPORTED so that every existing
// `import { type Task } from "@/lib/api"` keeps working untouched.
// `export type` (not `export`) because isolatedModules is on.
import type {
  TaskStatus,
  TaskPriority,
  TaskPatch,
  BindingDraft,
  SubtaskItem,
  Attachment,
  Task,
  ContainerScope,
  Project,
  Kpi,
  KpiProgress,
  TourState,
  SessionUser,
  NotificationInfo,
  SessionInfo,
  BillingInfo,
  Team,
  TeamWithRole,
  TeamDetail,
  TeamInvitation,
  Comment,
  Analytics,
  Progress,
} from "./api-types";

export type {
  TaskStatus,
  TaskPriority,
  TaskPatch,
  BindingDraft,
  UserRef,
  SubtaskItem,
  Attachment,
  Task,
  ContainerScope,
  Project,
  Kpi,
  TaskKpiBinding,
  KpiProgress,
  User,
  TourState,
  SessionUser,
  NotificationInfo,
  SessionInfo,
  PlanCaps,
  BillingInfo,
  Team,
  TeamWithRole,
  TeamDetail,
  TeamMember,
  InvitationStatus,
  TeamInvitation,
  Comment,
  AnalyticsSeriesItem,
  AnalyticsTotals,
  Analytics,
  ProgressDueChange,
  ProgressTask,
  Progress,
} from "./api-types";

// Errors live in lib/errors.ts (shared with the useAsyncError hook); these
// re-exports keep `import { isApiError } from "@/lib/api"` working.
export { isApiError } from "@/lib/errors";
export type { ApiError } from "@/lib/errors";
import { ERROR_RULES, isApiError, type ApiError } from "@/lib/errors";

// The browser console is failure-only (PRD: routine calls stay silent — the
// success trail already lives in the backend's request log, which prints to
// our terminal). Failures still surface here, one line each:
//   [api] POST /tasks → 403 (2ms) · forbidden "not a member of this team"
// Plain text, no %c styling, so the forwarded line stays readable.
function logCall(method: string, path: string, status: number, ms: number, detail?: string) {
  if (status > 0 && status < 400) return; // success — silent
  const line = `[api] ${method} ${path} → ${status} (${ms}ms)${detail ? ` · ${detail}` : ""}`;
  if (status === 0 || status >= 500) console.error(line);
  else console.warn(line);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const start = Date.now();
  const done = (status: number, detail?: string) =>
    logCall(method, path, status, Date.now() - start, detail);

  let res: Response;
  // A FormData body must NOT carry a Content-Type: the browser has to add the
  // multipart boundary itself, and a JSON header would break that. Everything
  // else keeps the house default.
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // fetch() itself rejected: server down, offline, CORS or DNS. Hand back the
    // same shape as every other failure so callers never special-case it.
    done(0, "network_error");
    throw {
      error: "network_error",
      // The proxy answers 502 when it cannot reach the backend, so a failure here
      // is this origin being unreachable — naming the API path is the only
      // location still meaningful now that requests are same-origin.
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
        // Every API failure is `{ error, message }` (see lib/errors.ts);
        // JSON.parse hands back `any`, so read it as `unknown` and keep only
        // the two fields we actually trust. Spreading the parsed blob
        // wholesale is how an unexpected body used to leak into `payload`.
        const parsed: unknown = JSON.parse(text);
        if (isErrorBody(parsed)) {
          payload = {
            error: parsed.error,
            message: typeof parsed.message === "string" ? parsed.message : "",
            status: res.status,
          };
        }
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
  // The one place the client asserts a shape it cannot check: the endpoint's
  // declared return type IS the contract, and every response is built by a
  // mapper in backend/lib/types.ts. Going through `unknown` keeps that trust
  // explicit instead of silently widening whatever JSON.parse returned.
  const body: unknown = text ? JSON.parse(text) : undefined;
  return body as T;
}

/** Narrow the `{ error, … }` envelope of a failed response before trusting it. */
function isErrorBody(v: unknown): v is { error: string; message?: unknown } {
  return (
    typeof v === "object" && v !== null && typeof (v as { error?: unknown }).error === "string"
  );
}

/**
 * Upload with progress. `fetch` reports no upload progress at all, so the
 * attachment endpoints go through XMLHttpRequest purely for that event.
 * Failures reject with the same `{ error, message, status }` shape `req()`
 * throws, so `useAsyncError`'s `run()` normalises them identically.
 */
function uploadViaXhr(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<{ attachment: Attachment }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    xhr.withCredentials = true; // the httpOnly cookie IS the session
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { attachment: Attachment });
        } catch {
          reject({ error: "invalid_response", message: "upload failed", status: 0 });
        }
        return;
      }
      let code = "upload_failed";
      let message = "upload failed";
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        if (isApiError(parsed)) {
          code = parsed.error;
          message = parsed.message;
        }
      } catch {
        // A non-JSON body (a proxy's 413 page, say) keeps the fallbacks.
      }
      reject({ error: code, message, status: xhr.status });
    };
    xhr.onerror = () => reject({ error: "network_error", message: "upload failed", status: 0 });
    xhr.send(form);
  });
}

export const api = {
  // ---- Auth ----
  signUp: (data: { username: string; password: string; display_name?: string }) =>
    req<{ user: SessionUser }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    req<{ user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () => req<void>("/auth/logout", { method: "POST" }),
  // PRD-05: the notification drawer's REST surface (live delivery rides SSE).
  listNotifications: () =>
    req<{ notifications: NotificationInfo[]; unread_count: number }>("/notifications"),
  markNotificationsRead: (ids: string[] | null) =>
    req<{ marked: number }>("/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  // PRD-08: password change also signs out every other device (revocation
  // floor); this device stays signed in via the fresh cookie in the response.
  changePassword: (data: { current_password: string; new_password: string }) =>
    req<void>("/auth/password", { method: "POST", body: JSON.stringify(data) }),
  revokeAllSessions: () => req<void>("/auth/revoke-all", { method: "POST" }),
  // Settings device list: every live session, tagged with `current` for the
  // calling device. Revoking the current row acts like a logout.
  listSessions: () => req<{ sessions: SessionInfo[] }>("/auth/sessions"),
  revokeSession: (id: string) => req<void>(`/auth/sessions/${id}`, { method: "DELETE" }),
  updateMe: (data: { display_name: string | null }) =>
    req<{ user: SessionUser }>("/me", { method: "PATCH", body: JSON.stringify(data) }),
  me: () => req<{ user: SessionUser }>("/me"),
  // PRD-13: record that the first-run tour was finished or skipped. Idempotent,
  // and the enum has no null — nothing here can re-arm the tour. Fire-and-forget
  // from the overlay (204, void → test `=== null`).
  patchTourState: (state: TourState) =>
    req<void>("/me/onboarding", { method: "PATCH", body: JSON.stringify({ state }) }),

  // ---- Billing (PRD-11 Phase 2) ----
  // GET /me/billing answers on every instance (self-hosted reads plan "free"
  // with billing_configured false) — the settings tile renders from it.
  getBilling: () => req<BillingInfo>("/me/billing"),
  // Checkout/portal return a Stripe-hosted URL to navigate to; the redirect
  // grants nothing (the webhook + sync do), so a failed click is harmless.
  startCheckout: (teamId: string) =>
    req<{ url: string }>(`/teams/${teamId}/billing/checkout`, { method: "POST" }),
  billingPortal: () => req<{ url: string }>("/me/billing/portal", { method: "POST" }),
  // Re-reads this user's subscriptions server-side — the settings tile calls
  // it on mount so a checkout return lands the plan even where the webhook
  // cannot reach (local dev). Void → test `=== null`.
  syncBilling: () => req<void>("/me/billing/sync", { method: "POST" }),

  // ---- Teams ----
  createTeam: (data: { name: string; kind?: "workspace" | "team" }) =>
    req<{ team: Team }>("/teams", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listTeams: () => req<{ teams: TeamWithRole[]; last_container_id: string | null }>("/teams"),
  // Owner (2026-09-06): persist the last-selected container server-side so a
  // refresh restores it. Fire-and-forget from the switcher; membership is
  // checked by the route.
  setLastContainer: (teamId: string) =>
    req<void>("/me/last-container", { method: "PUT", body: JSON.stringify({ team_id: teamId }) }),
  getTeam: (id: string) => req<TeamDetail>(`/teams/${id}`),
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
  // PRD-11: full payload for one task — used right after the create→upload
  // chain, since the create response predates its own steps and files.
  getTask: (id: string) => req<Task>(`/tasks/${id}`),
  // The cross-container due-soon set now lives in the notifications table
  // (PRD-11 §1.5, persistent rows). The bell badge + drawer render it
  // through the existing listNotifications() surface — no per-request
  // /me/due-soon endpoint any more.
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
      // PRD-10: assignable at creation — mirrors createTaskSchema.
      assignee_id?: string | null;
      kpis?: BindingDraft[];
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
  setTaskKpis: (id: string, kpis: BindingDraft[]) =>
    req<Task>(`/tasks/${id}/kpis`, { method: "PUT", body: JSON.stringify({ kpis }) }),
  updateTask: (id: string, data: TaskPatch) =>
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

  // ---- Subtasks (PRD-11 Phase 1.2) ----
  // No list endpoint: the checklist is embedded in every task response, so the
  // drawer renders `task.subtasks` and reconciles these mutations into it.
  createSubtask: (taskId: string, title: string) =>
    req<{ subtask: SubtaskItem }>(`/tasks/${taskId}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateSubtask: (id: string, data: { title?: string; done?: boolean }) =>
    req<{ subtask: SubtaskItem }>(`/subtasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteSubtask: (id: string) => req<void>(`/subtasks/${id}`, { method: "DELETE" }),
  // Full-list reorder: every id, in the order drawn.
  orderSubtasks: (taskId: string, ids: string[]) =>
    req<void>(`/tasks/${taskId}/subtasks/order`, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),

  // ---- Attachments (PRD-11 Phase 1.3) ----
  listAttachments: (taskId: string) =>
    req<{ attachments: Attachment[] }>(`/tasks/${taskId}/attachments`),
  deleteAttachment: (id: string) => req<void>(`/attachments/${id}`, { method: "DELETE" }),
  uploadAttachment: (taskId: string, file: File, onProgress?: (fraction: number) => void) =>
    uploadViaXhr(`/tasks/${taskId}/attachments`, file, onProgress),
  /**
   * Download is a navigation, not a fetch: the backend answers it with the
   * bytes and `Content-Disposition: attachment`. Going through the address bar
   * keeps it outside the CSP's `connect-src`, and the cookie rides along.
   */
  attachmentDownloadUrl: (id: string) => `${BASE}/attachments/${id}/download`,

  // ---- Comment attachments (PRD-11) ----
  listCommentAttachments: (commentId: string) =>
    req<{ attachments: Attachment[] }>(`/comments/${commentId}/attachments`),
  // Images and PDFs only — the route rejects anything else.
  uploadCommentAttachment: (
    commentId: string,
    file: File,
    onProgress?: (fraction: number) => void
  ) => uploadViaXhr(`/comments/${commentId}/attachments`, file, onProgress),

  // ---- Workspace logo (PRD-11 Phase 1.4) ----
  setTeamLogo: (teamId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return req<{ team: Team }>(`/teams/${teamId}/logo`, { method: "PUT", body: form });
  },
  removeTeamLogo: (teamId: string) =>
    req<{ team: Team }>(`/teams/${teamId}/logo`, { method: "DELETE" }),
  /** Rendered by <img>; `private, no-cache` on the response keeps it fresh. */
  teamLogoUrl: (teamId: string) => `${BASE}/teams/${teamId}/logo`,

  // ---- Analytics ----
  getAnalytics: (teamId: string, range: number) =>
    req<Analytics>(`/teams/${teamId}/analytics?range=${range}`),
  getProgress: (teamId: string) => req<Progress>(`/teams/${teamId}/progress`),
};
