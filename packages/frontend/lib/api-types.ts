// The domain types for every API response and request body.
//
// These live apart from `lib/api.ts` so the wire CONTRACT is readable in one
// place, and so a page that only needs a type does not pull in the fetch core.
// `lib/api.ts` imports them for its own method signatures and re-exports the
// whole list, so every existing `import { type Task } from "@/lib/api"` keeps
// working unchanged — moving these out must not touch a single consumer.
//
// Field names are snake_case because that is the wire format: the backend
// answers snake_case and nothing renames it on the way in. Type-only module —
// it emits no JavaScript at all, which smoke.mts asserts.

export type TaskStatus = "todo" | "in_progress" | "done" | "canceled";

export type TaskPriority = "low" | "medium" | "high";

// Exactly the body PATCH /tasks/:id accepts (backend `updateTaskSchema`,
// which is `.strict()`). `description` and `due_date` are nullable here — a
// null clears them — which is NOT true of `Partial<Task>`, so this is its own
// type rather than a derivation. Every drawer edit is one of these; the client
// and the validator can no longer disagree, so no call site needs a cast.
export type TaskPatch = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  project_id?: string | null;
  // PRD-10: member id of this task's container, or null to unassign.
  assignee_id?: string | null;
};

// One task→KPI binding as the client composes it, before the server has said
// the kpi exists. `PUT /tasks/:id/kpis` and `POST /teams/:id/tasks` both take
// an array of these.
export type BindingDraft = { kpi_id: string; weight: number };

// PRD-10: minimal user reference embedded in task payloads.
export type UserRef = {
  id: string;
  username: string;
  display_name: string | null;
};

// PRD-11 Phase 1.2: one checklist row. `position` is the order the server
// stored; the drawer renders the array as-is and sends the whole id list back
// when a row moves.
export type SubtaskItem = {
  id: string;
  title: string;
  done: boolean;
  position: number;
};

// PRD-11 Phase 1.3: one stored file. `size_bytes` is what the server measured,
// so the quota display can trust it.
export type Attachment = {
  id: string;
  task_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  uploader: UserRef;
  created_at: string;
};

export type Task = {
  id: string;
  team_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: string | null;
  kpis: TaskKpiBinding[];
  // PRD-11: the task's checklist, in stored order. Embedded in every task
  // response for the same reason as creator/assignee — the client replaces
  // whole task objects after a mutation.
  subtasks: SubtaskItem[];
  creator: UserRef | null;
  assignee: UserRef | null;
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

// PRD-13: the first-run tour's dismissal. Mirrors the backend enum + the DB
// CHECK on users.tour_state.
export type TourState = "completed" | "skipped";

// The SESSION user — what /me, signup, login and PATCH /me return. Deliberately
// not `User` widened: `User` is also the shape of a comment's `author`, which
// never carries a tour flag, so putting it there would be a type lie about every
// comment payload.
export type SessionUser = User & {
  /** null = never resolved, so the tour still runs. */
  tour_state: TourState | null;
  /** Bookkeeping only — no visibility rule reads it. */
  tour_resolved_at: string | null;
};

// One row of the Settings device list (PRD-08). `current` marks the calling
// device; revoking it is a logout.
// One row of the notification drawer (PRD-05). The payload is type-shaped on
// the frontend side — optional fields, read with ?..
export type NotificationInfo = {
  id: string;
  type: string;
  payload: {
    actor_username?: string;
    team_name?: string;
    team_id?: string;
    task_id?: string;
    task_title?: string;
    snippet?: string;
    invitation_id?: string;
    responded?: string;
    // PRD-11 §1.5: due-soon notifications carry the due timestamp and an
    // overdue flag so the drawer can pick the right icon (red vs amber).
    due_date?: string;
    overdue?: boolean;
  };
  read_at: string | null;
  created_at: string;
};

export type SessionInfo = {
  id: string;
  device: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

// PRD-11 Phase 2: the settings billing tile's payload. Caps use null for
// "unlimited" (publicCap on the server); period_end/grace_until are the
// webhook-maintained lifecycle timestamps.
export type PlanCaps = {
  members: number | null;
  teams: number | null;
  storage_bytes: number | null;
  file_bytes: number | null;
};

export type BillingInfo = {
  plan: string;
  billing_configured: boolean;
  checkout_configured: boolean;
  has_subscription: boolean;
  period_end: string | null;
  grace_until: string | null;
  caps: PlanCaps;
  /** The full tier ladder (lib/plans.ts) — the settings upgrade pitch renders
   *  "what Starter unlocks" from this instead of hardcoded numbers. */
  plans: Record<string, PlanCaps>;
};

export type Team = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  // PRD-06: one container model, two states.
  kind: "workspace" | "team";
  // PRD-11 Phase 1.4: whether the container has a logo. A boolean, not a URL —
  // the client builds the same-origin path with teamLogoUrl().
  has_logo: boolean;
  member_count: number;
  // PRD-11: the cap that applies to this container, from its leader's plan.
  // null = unlimited (a self-hosted instance, or the top tier) — so no screen
  // ever prints a hardcoded "3" again.
  member_limit: number | null;
  created_at: string;
};

export type TeamWithRole = Team & { role: "owner" | "member" };

/** GET /teams/:id — the container page's whole payload in one named type. */
export type TeamDetail = {
  team: Team;
  role: "owner" | "member";
  members: TeamMember[];
  invitations: TeamInvitation[];
};

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
  // PRD-11: files attached to this comment. Images render inline in the thread;
  // clicking one opens the shared large view.
  attachments: Attachment[];
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
