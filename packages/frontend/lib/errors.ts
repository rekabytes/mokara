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
  // PRD-06 KPI weights (per-task total must stay ≤ 100%)
  kpi_weight_exceeded: {
    kind: "input",
    action: "inline",
    message: "KPI weights must total 100% or less.",
  },

  // --- state collision ---
  username_taken: { kind: "conflict", action: "inline", message: "That username is taken." },
  team_full: {
    kind: "conflict",
    action: "inline",
    message: "This team is full — 3 members maximum.",
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
  lookup_failed: {
    kind: "server",
    action: "retry",
    message: "Couldn't load your account. Try again.",
  },

  // --- client-only (never sent by the server) ---
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
  500: "internal_error",
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
