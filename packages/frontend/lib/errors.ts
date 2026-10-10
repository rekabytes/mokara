// Single source of truth for "what went wrong talking to the API".
//
// The backend always answers failures with `{ error: <code>, message }` (see
// `lib/validate.ts` + each route), so the frontend maps that CODE — never the
// status alone — onto a kind, the copy to show, and what the UI should do.
// Adding an error on the server means adding one row here; nothing else changes.
//
//   action: "inline"   → show it where it happened (default)
//           "redirect" → bounce to /login (session is gone)
//           "retry"    → our fault; keep the data on screen, offer a retry
//   serverSays: true   → the server's message is specific and safe to show
//                        (Zod issues, "team_full" detail), so use it verbatim

export type ApiError = {
  error: string;
  message: string;
  status: number;
};

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "error" in e && "message" in e && "status" in e;
}

export type ErrorKind =
  "auth" | "permission" | "missing" | "input" | "conflict" | "server" | "network" | "unknown";

export type ErrorAction = "inline" | "redirect" | "retry";

export type ErrorRule = {
  kind: ErrorKind;
  action: ErrorAction;
  message: string;
  serverSays?: boolean;
};

/** Every code the backend can emit, plus the client-only ones. */
export const ERROR_RULES: Record<string, ErrorRule> = {
  // --- session / credentials ---
  not_authenticated: {
    kind: "auth",
    action: "redirect",
    message: "Your session has expired — sign in again.",
  },
  invalid_credentials: { kind: "auth", action: "inline", message: "Wrong username or password." },
  incorrect_password: {
    kind: "auth",
    action: "inline",
    message: "That's not your current password.",
  },

  // --- access ---
  forbidden: { kind: "permission", action: "inline", message: "You don't have access to this." },
  not_member: {
    kind: "permission",
    action: "inline",
    message: "You're not a member of this team.",
  },
  // PRD-06 container-scope rules (lib/container-scope.ts)
  team_scope_forbidden: {
    kind: "permission",
    action: "inline",
    message: "Team projects & KPIs unlock once this workspace becomes a team.",
  },
  owner_only: {
    kind: "permission",
    action: "inline",
    message: "Only the team leader can do that.",
  },

  // --- gone ---
  not_found: { kind: "missing", action: "inline", message: "That doesn't exist any more." },
  user_not_found: { kind: "missing", action: "inline", message: "No account with that username." },
  // PRD-06: bindings must stay inside one container (no cross-container links)
  kpi_not_found: {
    kind: "missing",
    action: "inline",
    message: "That KPI isn't in this container.",
  },
  // PRD-10
  assignee_not_member: {
    kind: "input",
    action: "inline",
    message: "Assignee must be a member of this container.",
  },

  // --- we asked for something wrong ---
  invalid_input: {
    kind: "input",
    action: "inline",
    serverSays: true,
    message: "Check the highlighted fields.",
  },
  invalid_status: {
    kind: "input",
    action: "inline",
    serverSays: true,
    message: "That status isn't allowed.",
  },
  unsupported_type: {
    kind: "input",
    action: "inline",
    serverSays: true,
    message: "That file type isn't supported.",
  },
  invalid_signature: {
    kind: "input",
    action: "inline",
    message: "The request signature is invalid.",
  },
  // PRD-06 KPI weights (per-task total must stay ≤ 100%)
  kpi_weight_exceeded: {
    kind: "input",
    action: "inline",
    message: "KPI weights must total 100% or less.",
  },
  // Owner rule (2026-09-05): binding is personal — you attach only KPIs you
  // created. Teammates' bindings on a task are frozen from your chip.
  kpi_not_owner: {
    kind: "permission",
    action: "inline",
    serverSays: true,
    message: "You can only bind your own KPIs.",
  },

  // --- state collision ---
  username_taken: { kind: "conflict", action: "inline", message: "That username is taken." },
  team_full: {
    kind: "conflict",
    action: "inline",
    // PRD-11: the number depends on the leader's plan, so only the server can
    // state it — show its sentence rather than a hardcoded "3 members".
    serverSays: true,
    message: "This team is full.",
  },
  workspace_limit: {
    kind: "conflict",
    action: "inline",
    // Same reason: the plan decides how many teams one account may lead.
    serverSays: true,
    message: "Your plan has no more team seats.",
  },

  // --- storage (PRD-11 Phase 1.3) ---
  quota_exceeded: {
    kind: "conflict",
    action: "inline",
    // The number is the plan's, so the server states it.
    serverSays: true,
    message: "This workspace is out of storage.",
  },
  file_too_large: {
    kind: "input",
    action: "inline",
    serverSays: true,
    message: "That file is too large for this plan.",
  },
  attachments_disabled: {
    kind: "conflict",
    action: "inline",
    // True on any instance with no bucket configured — including a
    // self-hosted one that never intended to store files.
    serverSays: true,
    message: "This instance has no file storage configured.",
  },
  storage_unavailable: {
    kind: "server",
    action: "retry",
    message: "File storage could not be reached — try again.",
  },

  // --- billing (PRD-11 Phase 2) ---
  billing_not_configured: {
    kind: "conflict",
    action: "inline",
    // True on any self-hosted instance — including one that never intended
    // to take payments. The server says it; that IS the honest state.
    serverSays: true,
    message: "Billing is not enabled on this instance.",
  },
  already_subscribed: {
    kind: "conflict",
    action: "inline",
    serverSays: true,
    message: "You already have a paid plan.",
  },
  no_subscription: {
    kind: "conflict",
    action: "inline",
    message: "No billing account yet — upgrade first.",
  },

  // --- GitHub App integration ---
  github_webhook_not_configured: {
    kind: "server",
    action: "inline",
    message: "GitHub incoming sync is not configured on this instance.",
  },
  invalid_github_signature: {
    kind: "permission",
    action: "inline",
    message: "The GitHub webhook signature is invalid.",
  },
  invalid_github_delivery: {
    kind: "input",
    action: "inline",
    message: "The GitHub webhook delivery ID is invalid.",
  },
  payload_too_large: {
    kind: "input",
    action: "inline",
    message: "The request exceeds the allowed size.",
  },
  invalid_json: { kind: "input", action: "inline", message: "The request body is not valid JSON." },
  github_not_configured: {
    kind: "conflict",
    action: "inline",
    message: "GitHub integration is not configured on this instance.",
  },
  github_state_expired: {
    kind: "conflict",
    action: "inline",
    message: "That GitHub connection attempt expired. Start again.",
  },
  github_access_denied: {
    kind: "permission",
    action: "inline",
    message: "GitHub access was denied or has been revoked.",
  },
  github_installation_unverified: {
    kind: "permission",
    action: "inline",
    message: "That GitHub installation could not be verified for your account.",
  },
  github_connection_required: {
    kind: "conflict",
    action: "inline",
    message: "Connect your GitHub account first.",
  },
  github_reauthorization_required: {
    kind: "conflict",
    action: "inline",
    message: "Reconnect GitHub to verify your repository access.",
  },
  github_repository_limit: {
    kind: "conflict",
    action: "inline",
    message: "You can activate at most three GitHub repositories.",
  },
  github_repository_inactive: {
    kind: "conflict",
    action: "inline",
    message: "Activate this repository in GitHub settings to resume sync.",
  },
  github_workspace_access_revoked: {
    kind: "permission",
    action: "inline",
    message: "The connected user no longer belongs to this workspace. GitHub sync is paused.",
  },
  github_issue_not_linked: {
    kind: "conflict",
    action: "inline",
    message: "This task has no linked GitHub issue.",
  },
  github_issue_mismatch: {
    kind: "conflict",
    action: "inline",
    message: "The linked GitHub issue could not be verified.",
  },
  github_sync_failed: {
    kind: "server",
    action: "retry",
    message: "GitHub status sync failed. Your task is saved; sync will retry automatically.",
  },
  github_repository_forbidden: {
    kind: "permission",
    action: "inline",
    message: "That repository is not connected to your GitHub account.",
  },
  github_repository_unavailable: {
    kind: "conflict",
    action: "inline",
    message: "That repository is no longer available to Mokara.",
  },
  github_issue_already_linked: {
    kind: "conflict",
    action: "inline",
    message: "This task already has a GitHub issue.",
  },
  github_publish_in_progress: {
    kind: "conflict",
    action: "inline",
    message: "This GitHub issue is already being published.",
  },
  github_rate_limited: {
    kind: "server",
    action: "retry",
    message: "GitHub's rate limit was reached. Try again later.",
  },
  github_unavailable: {
    kind: "server",
    action: "retry",
    message: "GitHub could not be reached. Try again.",
  },
  github_publish_failed: {
    kind: "server",
    action: "retry",
    message: "The GitHub issue could not be created. Try again.",
  },

  already_member: { kind: "conflict", action: "inline", message: "That user is already a member." },
  already_invited: {
    kind: "conflict",
    action: "inline",
    message: "There's already a pending invite for that user.",
  },
  cannot_invite_self: { kind: "conflict", action: "inline", message: "You can't invite yourself." },
  already_responded: {
    kind: "conflict",
    action: "inline",
    message: "You've already answered this invitation.",
  },
  invite_expired: { kind: "conflict", action: "inline", message: "This invitation has expired." },
  owner_must_transfer: {
    kind: "conflict",
    action: "inline",
    message: "Choose a new owner before you leave the team.",
  },
  kpi_in_use: {
    kind: "conflict",
    action: "inline",
    message: "Tasks are still weighted toward this KPI.",
  },

  // --- their fault, not yours ---
  internal_error: {
    kind: "server",
    action: "retry",
    message: "Something broke on our side. Try again.",
  },
  service_unavailable: {
    kind: "server",
    action: "retry",
    message: "The service is briefly unavailable — try again in a moment.",
  },
  lookup_failed: {
    kind: "server",
    action: "retry",
    message: "Couldn't load your account. Try again.",
  },
  api_misconfigured: {
    kind: "server",
    action: "retry",
    message: "The API is not configured. Contact the instance administrator.",
  },
  invalid_response: {
    kind: "server",
    action: "retry",
    message: "The server returned an invalid response. Try again.",
  },
  upload_failed: {
    kind: "server",
    action: "retry",
    message: "The upload failed. Try again.",
  },

  // --- client-only / transport errors ---
  network_error: {
    kind: "network",
    action: "retry",
    message: "Can't reach the server. Is the API running?",
  },
};

const STATUS_FALLBACK: Record<number, string> = {
  400: "invalid_input",
  401: "not_authenticated",
  403: "forbidden",
  404: "not_found",
  409: "invalid_input",
  413: "file_too_large",
  422: "invalid_input",
  500: "internal_error",
  502: "network_error",
  503: "service_unavailable",
};

const UNKNOWN: ErrorRule = {
  kind: "unknown",
  action: "inline",
  message: "Something went wrong.",
};

export type NormalizedError = {
  /** API code (`forbidden`), or `network_error` / `unknown`. */
  code: string;
  kind: ErrorKind;
  /** HTTP status; 0 = never reached the server. */
  status: number;
  /** Safe to render. Server copy when it's specific, ours otherwise. */
  message: string;
  action: ErrorAction;
  retryable: boolean;
  /** The original throw, for logging/telemetry. */
  cause: unknown;
};

/**
 * Turn anything thrown (API payload, `TypeError` from fetch, a bare Error, a
 * string) into a NormalizedError. `fallback` only replaces the copy when the
 * code is genuinely unmapped — page-specific wording shouldn't hide a real,
 * well-known error.
 */
export function normalizeError(e: unknown, fallback?: string): NormalizedError {
  let code = "unknown";
  let status = 0;
  let serverMessage = "";

  if (isApiError(e)) {
    code = e.error;
    status = e.status;
    serverMessage = (e.message ?? "").trim();
  } else if (e instanceof TypeError) {
    // fetch() rejects with TypeError on connection/CORS/offline failures.
    code = "network_error";
  } else if (e instanceof Error) {
    serverMessage = e.message.trim();
  } else if (typeof e === "string") {
    serverMessage = e.trim();
  }

  const known = ERROR_RULES[code];
  const rule = known ?? ERROR_RULES[STATUS_FALLBACK[status] ?? ""] ?? UNKNOWN;
  const mapped = Boolean(known);

  let message: string;
  if (mapped && rule.serverSays && serverMessage && serverMessage !== code) {
    message = serverMessage;
  } else if (mapped) {
    message = rule.message;
  } else {
    message = fallback || serverMessage || UNKNOWN.message;
  }

  return {
    code: mapped ? code : (STATUS_FALLBACK[status] ?? code),
    kind: rule.kind,
    status,
    message,
    action: rule.action,
    retryable: rule.action === "retry",
    cause: e,
  };
}

/** Message only — for the call sites that just need a string to render. */
export function describeError(e: unknown, fallback?: string): string {
  return normalizeError(e, fallback).message;
}

/**
 * A client-side validation message shaped like a server error, so pages that
 * already have one error channel can keep using it (e.g. "Team name is
 * required" before any request is made).
 */
export function manualError(message: string): NormalizedError {
  return {
    code: "client_validation",
    kind: "input",
    status: 0,
    message,
    action: "inline",
    retryable: false,
    cause: null,
  };
}
