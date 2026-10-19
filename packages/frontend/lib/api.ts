import {
  supportSitesSchema,
  supportSiteSchema,
  supportListSchema,
  supportDetailSchema,
  supportSubmissionResultSchema,
  supportPublicDetailSchema,
  supportOkSchema,
  supportTaskSchema,
  supportFileSchema,
  type SupportSiteDraft,
  type SupportSubmission,
  type SupportTicket,
} from "./support-types";
import { z as supportZ } from "zod";
import {
  fileListSchema,
  workspaceFileResultSchema,
  workspaceFolderResultSchema,
  fileActionSchema,
  mcpRepositoriesSchema,
  mcpActivitySchema,
  mcpConsentSchema,
  mcpConsentResultSchema,
  mcpConnectionsSchema,
  mcpCredentialSchema,
  analyticsSchema,
  attachmentsSchema,
  billingSchema,
  commentResultSchema,
  commentsSchema,
  completeSocialSchema,
  emptySchema,
  githubIntegrationSchema,
  githubIssueResultSchema,
  invitationResponseSchema,
  invitationResultSchema,
  invitationsSchema,
  kpiProgressListSchema,
  kpiResultSchema,
  kpisSchema,
  navigationSchema,
  notificationListSchema,
  notificationReadSchema,
  parseResponse,
  pendingSocialSchema,
  progressSchema,
  projectDeletionSchema,
  projectResultSchema,
  projectsSchema,
  sessionSchema,
  sessionsSchema,
  signupProtectionSchema,
  socialConnectionsSchema,
  socialProvidersSchema,
  subtaskResultSchema,
  taskSchema,
  tasksSchema,
  teamDetailSchema,
  teamResultSchema,
  teamsSchema,
  uploadSchema,
} from "./api-validation";
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
  FileQuery,
  BindingDraft,
  ContainerScope,
  TaskPatch,
  TaskPriority,
  TaskStatus,
  TourState,
} from "./api-types";

export type {
  McpConnection,
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
  GitHubIntegration,
  GitHubRepository,
  GitHubIssue,
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
import { ERROR_RULES, type ApiError } from "@/lib/errors";
import type { z } from "zod";

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

async function req<T>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
  onHeaders?: (headers: Headers) => void,
  binary = false
): Promise<T> {
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
  } catch (error) {
    if (init?.signal?.aborted) throw error;
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
    const detail = Object.hasOwn(ERROR_RULES, payload.error) ? payload.error : "unknown_error";
    done(res.status, detail);
    throw payload;
  }
  done(res.status);
  if (res.status === 204) return parseResponse(schema, undefined);
  if (binary) return parseResponse(schema, await res.blob());
  const text = await res.text();
  // Every successful response crosses a runtime schema before reaching state.
  try {
    const body: unknown = text ? JSON.parse(text) : undefined;
    const parsed = parseResponse(schema, body);
    onHeaders?.(res.headers);
    return parsed;
  } catch {
    throw {
      error: "invalid_response",
      message: "Unexpected server response.",
      status: 502,
    } satisfies ApiError;
  }
}

// Preserve complete board/thread snapshots while bounding each server query.
// A failed or cancelled page rejects the whole read; never report a partial list.
async function collection<T, Item extends { id: string }>(
  schema: z.ZodType<T>,
  path: string,
  items: (response: T) => Item[],
  signal?: AbortSignal
): Promise<Item[]> {
  const rows = new Map<string, Item>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    signal?.throwIfAborted();
    const nextPath = cursor
      ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`
      : path;
    const continuation: { cursor: string | null } = { cursor: null };
    const response = await req(schema, nextPath, { signal }, (headers) => {
      continuation.cursor = headers.get("x-mokara-next-cursor");
    });
    signal?.throwIfAborted();
    const next = continuation.cursor;
    const page = items(response);
    for (const row of page) rows.set(row.id, row);
    if (next && (seen.has(next) || next.length > 512 || page.length === 0)) {
      throw {
        error: "invalid_response",
        message: "Unexpected server response.",
        status: 502,
      } satisfies ApiError;
    }
    if (next) seen.add(next);
    cursor = next;
  } while (cursor);
  return [...rows.values()];
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
function uploadViaXhr<T>(
  schema: z.ZodType<T>,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    xhr.withCredentials = true; // the httpOnly cookie IS the session
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    const abort = () => xhr.abort();
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body: unknown = JSON.parse(xhr.responseText);
          resolve(parseResponse(schema, body));
        } catch {
          reject({ error: "invalid_response", message: "upload failed", status: 502 });
        }
        return;
      }
      let code = "upload_failed";
      let message = "upload failed";
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        // Backend response bodies contain `{ error, message }`; the HTTP status
        // lives on XHR and is added below. Using isApiError() here used to drop
        // every specific upload error because that guard correctly requires a
        // status on an already-complete client error.
        if (isErrorBody(parsed)) {
          code = parsed.error;
          if (typeof parsed.message === "string") message = parsed.message;
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
  supportSites: (teamId: string, signal?: AbortSignal) =>
    req(supportSitesSchema, `/teams/${teamId}/support/sites`, { signal, cache: "no-store" }),
  saveSupportSite: async (teamId: string, data: SupportSiteDraft, id?: string) =>
    id
      ? req(supportOkSchema, `/teams/${teamId}/support/sites/${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        })
      : req(supportZ.object({ site: supportSiteSchema }), `/teams/${teamId}/support/sites`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
  supportTickets: (teamId: string, cursor?: string, signal?: AbortSignal) =>
    req(
      supportListSchema,
      `/teams/${teamId}/support/tickets?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal, cache: "no-store" }
    ),
  supportTicket: (teamId: string, id: string, cursor?: string, signal?: AbortSignal) =>
    req(
      supportDetailSchema,
      `/teams/${teamId}/support/tickets/${id}?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal, cache: "no-store" }
    ),
  patchSupportTicket: (
    teamId: string,
    id: string,
    data: Partial<Pick<SupportTicket, "status" | "priority" | "assignee_id">>
  ) =>
    req(supportOkSchema, `/teams/${teamId}/support/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  replySupportTicket: (
    teamId: string,
    id: string,
    data: { request_id: string; body: string; internal: boolean }
  ) =>
    req(supportOkSchema, `/teams/${teamId}/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  supportTicketTask: (teamId: string, id: string) =>
    req(supportTaskSchema, `/teams/${teamId}/support/tickets/${id}/task`, { method: "POST" }),
  submitSupportTicket: (id: string, data: SupportSubmission) =>
    req(supportSubmissionResultSchema, `/support-public/sites/${id}/tickets`, {
      method: "POST",
      credentials: "omit",
      body: JSON.stringify(data),
    }),
  publicSupportTicket: (id: string, token: string, cursor?: string, signal?: AbortSignal) =>
    req(
      supportPublicDetailSchema,
      `/support-public/tickets/${id}?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      {
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      }
    ),
  publicSupportReply: (id: string, token: string, data: { request_id: string; body: string }) =>
    req(supportOkSchema, `/support-public/tickets/${id}/messages`, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  uploadSupportFile: (id: string, token: string, uploadId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return req(supportOkSchema, `/support-public/tickets/${id}/files?upload_id=${uploadId}`, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  },
  downloadSupportFile: (id: string, token: string, fileId: string) =>
    req(
      supportFileSchema,
      `/support-public/tickets/${id}/files/${fileId}`,
      { credentials: "omit", headers: { Authorization: `Bearer ${token}` } },
      undefined,
      true
    ),

  listFiles: (teamId: string, query: FileQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    return req(fileListSchema, `/teams/${teamId}/files?${params}`, { signal, cache: "no-store" });
  },
  uploadWorkspaceFile: (
    teamId: string,
    folderId: string | null,
    uploadId: string,
    file: File,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({ upload_id: uploadId });
    if (folderId) params.set("folder_id", folderId);
    return uploadViaXhr(
      workspaceFileResultSchema,
      `/teams/${teamId}/files?${params}`,
      file,
      onProgress,
      signal
    );
  },
  createFolder: (teamId: string, name: string, parentId: string | null) =>
    req(workspaceFolderResultSchema, `/teams/${teamId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    }),
  updateFolder: (teamId: string, id: string, data: { name?: string; parent_id?: string | null }) =>
    req(workspaceFolderResultSchema, `/teams/${teamId}/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateFile: (teamId: string, id: string, data: { name?: string; folder_id?: string | null }) =>
    req(workspaceFileResultSchema, `/teams/${teamId}/files/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  manageFileItem: (
    teamId: string,
    kind: "files" | "folders",
    id: string,
    action: "trash" | "restore" | "delete"
  ) =>
    req(
      fileActionSchema,
      `/teams/${teamId}/${kind}/${id}${action === "delete" ? "" : `/${action}`}`,
      { method: action === "delete" ? "DELETE" : "POST" }
    ),
  workspaceFileUrl: (teamId: string, id: string, action: "preview" | "download") =>
    `${BASE}/teams/${teamId}/files/${id}/${action}`,

  mcpConsent: (request: string, signal?: AbortSignal) =>
    req(mcpConsentSchema, `/mcp/oauth/consent?request=${encodeURIComponent(request)}`, { signal }),
  approveMcp: (
    data: {
      request: string;
      approve: boolean;
      workspace_ids: string[];
      scopes?: string[];
      repository_ids?: string[];
    },
    signal?: AbortSignal
  ) =>
    req(mcpConsentResultSchema, "/mcp/oauth/consent", {
      signal,
      method: "POST",
      body: JSON.stringify(data),
    }),
  // ---- Auth ----
  socialProviders: (signal?: AbortSignal) =>
    req(socialProvidersSchema, "/auth/social/providers", { cache: "no-store", signal }),
  socialConnections: (signal?: AbortSignal) =>
    req(socialConnectionsSchema, "/auth/social/connections", {
      cache: "no-store",
      signal,
    }),
  startSocial: (provider: "google" | "github", data: { intent: "login" | "link"; from?: string }) =>
    req(navigationSchema, `/auth/social/${provider}/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  claimUsername: (username: string) =>
    req(sessionSchema, "/auth/social/username/claim", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  pendingSocial: (signal?: AbortSignal) =>
    req(pendingSocialSchema, "/auth/social/pending", { cache: "no-store", signal }),
  completeSocial: (data: { turnstile_token?: string }) =>
    req(completeSocialSchema, "/auth/social/complete", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  signupProtection: (signal?: AbortSignal) =>
    req(signupProtectionSchema, "/auth/signup-protection", {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    }),
  signUp: (data: {
    username: string;
    password: string;
    display_name?: string;
    turnstile_token?: string;
  }) =>
    req(sessionSchema, "/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    req(sessionSchema, "/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () => req(emptySchema, "/auth/logout", { method: "POST" }),
  // PRD-05: the notification drawer's REST surface (live delivery rides SSE).
  listNotifications: (signal?: AbortSignal) =>
    req(notificationListSchema, "/notifications", { signal }),
  markNotificationsRead: (ids: string[] | null) =>
    req(notificationReadSchema, "/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  // PRD-08: password change also signs out every other device (revocation
  // floor); this device stays signed in via the fresh cookie in the response.
  changePassword: (data: { current_password: string; new_password: string }) =>
    req(emptySchema, "/auth/password", { method: "POST", body: JSON.stringify(data) }),
  revokeAllSessions: () => req(emptySchema, "/auth/revoke-all", { method: "POST" }),
  // Settings device list: every live session, tagged with `current` for the
  // calling device. Revoking the current row acts like a logout.
  listSessions: (signal?: AbortSignal) => req(sessionsSchema, "/auth/sessions", { signal }),
  revokeSession: (id: string) => req(emptySchema, `/auth/sessions/${id}`, { method: "DELETE" }),
  updateMe: (data: { display_name: string | null }) =>
    req(sessionSchema, "/me", { method: "PATCH", body: JSON.stringify(data) }),
  me: (signal?: AbortSignal) => req(sessionSchema, "/me", { signal }),
  // PRD-13: record that the first-run tour was finished or skipped. Idempotent,
  // and the enum has no null — nothing here can re-arm the tour. Fire-and-forget
  // from the overlay (204, void → test `=== null`).
  patchTourState: (state: TourState) =>
    req(emptySchema, "/me/onboarding", { method: "PATCH", body: JSON.stringify({ state }) }),

  // ---- Billing (PRD-11 Phase 2) ----
  // GET /me/billing answers on every instance (self-hosted reads plan "free"
  // with billing_configured false) — the settings tile renders from it.
  getBilling: (signal?: AbortSignal) => req(billingSchema, "/me/billing", { signal }),
  // Checkout/portal return a Stripe-hosted URL to navigate to; the redirect
  // grants nothing (the webhook + sync do), so a failed click is harmless.
  startCheckout: (teamId: string) =>
    req(navigationSchema, `/teams/${teamId}/billing/checkout`, { method: "POST" }),
  billingPortal: () => req(navigationSchema, "/me/billing/portal", { method: "POST" }),
  // Re-reads this user's subscriptions server-side — the settings tile calls
  // it on mount so a checkout return lands the plan even where the webhook
  // cannot reach (local dev). Void → test `=== null`.
  syncBilling: () => req(emptySchema, "/me/billing/sync", { method: "POST" }),

  // ---- Read-only AI agent connections ----
  listMcpRepositories: (signal?: AbortSignal) =>
    req(mcpRepositoriesSchema, "/me/mcp-connections/repositories", { signal }),
  listMcpActivity: (signal?: AbortSignal) =>
    req(mcpActivitySchema, "/me/mcp-connections/activity", { signal }),
  listMcpConnections: (signal?: AbortSignal) =>
    req(mcpConnectionsSchema, "/me/mcp-connections", { signal }),
  createMcpConnection: (data: {
    name: string;
    workspace_ids: string[];
    expires_in_days: number;
    scopes?: string[];
    repository_ids?: string[];
  }) =>
    req(mcpCredentialSchema, "/me/mcp-connections", { method: "POST", body: JSON.stringify(data) }),
  revokeMcpConnection: (id: string) =>
    req(emptySchema, `/me/mcp-connections/${id}`, { method: "DELETE" }),

  // ---- GitHub App integration ----
  getGitHubIntegration: (signal?: AbortSignal) =>
    req(githubIntegrationSchema, "/me/integrations/github", { signal }),
  connectGitHub: () => req(navigationSchema, "/me/integrations/github/connect", { method: "POST" }),
  installGitHub: () => req(navigationSchema, "/me/integrations/github/install", { method: "POST" }),
  refreshGitHub: () =>
    req(githubIntegrationSchema, "/me/integrations/github/refresh", { method: "POST" }),
  disconnectGitHub: () => req(emptySchema, "/me/integrations/github", { method: "DELETE" }),
  setGitHubRepositories: (repositoryIds: string[]) =>
    req(githubIntegrationSchema, "/me/integrations/github/repositories", {
      method: "PUT",
      body: JSON.stringify({ repository_ids: repositoryIds }),
    }),
  retryGitHubSync: (taskId: string) =>
    req(taskSchema, `/tasks/${taskId}/github-sync`, { method: "POST" }),
  publishGitHubIssue: (taskId: string, repositoryId: string) =>
    req(githubIssueResultSchema, `/tasks/${taskId}/github-issue`, {
      method: "POST",
      body: JSON.stringify({ repository_id: repositoryId }),
    }),

  // ---- Teams ----
  createTeam: (data: { name: string; kind?: "workspace" | "team" }) =>
    req(teamResultSchema, "/teams", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listTeams: (signal?: AbortSignal) => req(teamsSchema, "/teams", { signal }),
  // Owner (2026-09-06): persist the last-selected container server-side so a
  // refresh restores it. Fire-and-forget from the switcher; membership is
  // checked by the route.
  setLastContainer: (teamId: string) =>
    req(emptySchema, "/me/last-container", {
      method: "PUT",
      body: JSON.stringify({ team_id: teamId }),
    }),
  getTeam: (id: string, signal?: AbortSignal) => req(teamDetailSchema, `/teams/${id}`, { signal }),
  leaveTeam: (id: string) => req(emptySchema, `/teams/${id}/leave`, { method: "POST" }),
  inviteToTeam: (id: string, data: { username: string }) =>
    req(invitationResultSchema, `/teams/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- Invitations ----
  listInvitations: () => req(invitationsSchema, "/invitations"),
  respondToInvitation: (
    id: string,
    action: "accept" | "decline"
  ): Promise<{
    invitation_id: string;
    status: string;
    team_id?: string;
  }> =>
    req(invitationResponseSchema, `/invitations/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  // ---- Tasks (team-scoped) ----
  // PRD-11: full payload for one task — used right after the create→upload
  // chain, since the create response predates its own steps and files.
  getTask: (id: string) => req(taskSchema, `/tasks/${id}`),
  // The cross-container due-soon set now lives in the notifications table
  // (PRD-11 §1.5, persistent rows). The bell badge + drawer render it
  // through the existing listNotifications() surface — no per-request
  // /me/due-soon endpoint any more.
  listTeamTasks: (teamId: string, status?: string, signal?: AbortSignal) =>
    collection(
      tasksSchema,
      `/teams/${teamId}/tasks${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      (rows) => rows,
      signal
    ),
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
    req(taskSchema, `/teams/${teamId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- Projects & KPIs (PRD-06) ----
  listProjects: (teamId: string, all?: boolean, signal?: AbortSignal) =>
    req(projectsSchema, `/teams/${teamId}/projects${all ? "?all=1" : ""}`, { signal }),
  createProject: (
    teamId: string,
    data: { name: string; color?: string | null; scope?: ContainerScope }
  ) =>
    req(projectResultSchema, `/teams/${teamId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: { name?: string; color?: string | null; archived?: boolean }) =>
    req(projectResultSchema, `/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    req(projectDeletionSchema, `/projects/${id}`, { method: "DELETE" }),
  listKpis: (teamId: string, signal?: AbortSignal) =>
    req(kpisSchema, `/teams/${teamId}/kpis`, { signal }),
  createKpi: (teamId: string, data: { name: string }) =>
    req(kpiResultSchema, `/teams/${teamId}/kpis`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateKpi: (id: string, data: { name?: string }) =>
    req(kpiResultSchema, `/kpis/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteKpi: (id: string) => req(emptySchema, `/kpis/${id}`, { method: "DELETE" }),
  getKpiProgress: (teamId: string, signal?: AbortSignal) =>
    req(kpiProgressListSchema, `/teams/${teamId}/kpis/progress`, { signal }),
  // Replace-all binding set for a task; [] clears.
  setTaskKpis: (id: string, kpis: BindingDraft[]) =>
    req(taskSchema, `/tasks/${id}/kpis`, { method: "PUT", body: JSON.stringify({ kpis }) }),
  updateTask: (id: string, data: TaskPatch) =>
    req(taskSchema, `/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTask: (id: string) => req(emptySchema, `/tasks/${id}`, { method: "DELETE" }),
  flagTask: (id: string) => req(taskSchema, `/tasks/${id}/flag`, { method: "POST" }),

  // ---- Comments ----
  listComments: async (taskId: string, signal?: AbortSignal) => ({
    comments: await collection(
      commentsSchema,
      `/tasks/${taskId}/comments`,
      (page) => page.comments,
      signal
    ),
  }),
  createComment: (taskId: string, body: string, parentId?: string) =>
    req(commentResultSchema, `/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, ...(parentId ? { parent_id: parentId } : {}) }),
    }),
  updateComment: (id: string, body: string) =>
    req(commentResultSchema, `/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id: string) => req(emptySchema, `/comments/${id}`, { method: "DELETE" }),

  // ---- Subtasks (PRD-11 Phase 1.2) ----
  // No list endpoint: the checklist is embedded in every task response, so the
  // drawer renders `task.subtasks` and reconciles these mutations into it.
  createSubtask: (taskId: string, title: string) =>
    req(subtaskResultSchema, `/tasks/${taskId}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateSubtask: (id: string, data: { title?: string; done?: boolean }) =>
    req(subtaskResultSchema, `/subtasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteSubtask: (id: string) => req(emptySchema, `/subtasks/${id}`, { method: "DELETE" }),
  // Full-list reorder: every id, in the order drawn.
  orderSubtasks: (taskId: string, ids: string[]) =>
    req(emptySchema, `/tasks/${taskId}/subtasks/order`, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),

  // ---- Attachments (PRD-11 Phase 1.3) ----
  listAttachments: (taskId: string, signal?: AbortSignal) =>
    req(attachmentsSchema, `/tasks/${taskId}/attachments`, { signal }),
  deleteAttachment: (id: string) => req(emptySchema, `/attachments/${id}`, { method: "DELETE" }),
  uploadAttachment: (taskId: string, file: File, onProgress?: (fraction: number) => void) =>
    uploadViaXhr(uploadSchema, `/tasks/${taskId}/attachments`, file, onProgress),
  /**
   * Download is a navigation, not a fetch: the backend answers it with the
   * bytes and `Content-Disposition: attachment`. Going through the address bar
   * keeps it outside the CSP's `connect-src`, and the cookie rides along.
   */
  attachmentDownloadUrl: (id: string) => `${BASE}/attachments/${id}/download`,

  // ---- Comment attachments (PRD-11) ----
  listCommentAttachments: (commentId: string) =>
    req(attachmentsSchema, `/comments/${commentId}/attachments`),
  // Images and PDFs only — the route rejects anything else.
  uploadCommentAttachment: (
    commentId: string,
    file: File,
    onProgress?: (fraction: number) => void
  ) => uploadViaXhr(uploadSchema, `/comments/${commentId}/attachments`, file, onProgress),

  // ---- Workspace logo (PRD-11 Phase 1.4) ----
  setTeamLogo: (teamId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return req(teamResultSchema, `/teams/${teamId}/logo`, { method: "PUT", body: form });
  },
  removeTeamLogo: (teamId: string) =>
    req(teamResultSchema, `/teams/${teamId}/logo`, { method: "DELETE" }),
  /** Rendered by <img>; `private, no-cache` on the response keeps it fresh. */
  teamLogoUrl: (teamId: string) => `${BASE}/teams/${teamId}/logo`,

  // ---- Analytics ----
  getAnalytics: (teamId: string, range: number, signal?: AbortSignal) =>
    req(analyticsSchema, `/teams/${teamId}/analytics?range=${range}`, { signal }),
  getProgress: (teamId: string, signal?: AbortSignal) =>
    req(progressSchema, `/teams/${teamId}/progress`, { signal }),
};
