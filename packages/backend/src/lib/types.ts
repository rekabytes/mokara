// Response shapes. Keep these in sync with packages/frontend/lib/api.ts.
// Field names are snake_case to preserve the existing API contract — the
// frontend's `Task`, `Team`, etc. types depend on this exact shape.

import type {
  Task as PrismaTask,
  Project as PrismaProject,
  Kpi as PrismaKpi,
  TaskKpi as PrismaTaskKpi,
  User as PrismaUser,
  Team as PrismaTeam,
  TeamMember as PrismaTeamMember,
  TeamInvitation as PrismaTeamInvitation,
  Comment as PrismaComment,
  Notification as PrismaNotification,
  SubtaskItem as PrismaSubtaskItem,
  Attachment as PrismaAttachment,
} from "@mokara/db/prisma/generated/client";

export type UserResponse = {
  id: string;
  username: string;
  display_name: string | null;
  created_at: string;
};

export type TeamResponse = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  kind: string; // "workspace" | "team" (PRD-06)
  // PRD-11 Phase 1.4: whether this container has a logo. A boolean, not a URL —
  // the client builds the same-origin path itself, so the backend never has to
  // know how it is addressed from the browser.
  has_logo: boolean;
  member_count: number;
  // PRD-11: the leader's plan cap, or null when the plan is unlimited. The UI
  // renders this instead of ever hardcoding "3" again.
  member_limit: number | null;
  created_at: string;
};

export type TeamWithRoleResponse = TeamResponse & { role: string };

export type TeamMemberResponse = {
  user_id: string;
  username: string;
  display_name: string | null;
  role: string;
  joined_at: string;
};

export type TeamInvitationResponse = {
  id: string;
  team_id: string;
  team_name?: string;
  inviter_id: string;
  inviter_name?: string;
  invitee_username: string;
  status: string;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type TaskResponse = {
  id: string;
  team_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  project_id: string | null;
  kpis: TaskKpiResponse[];
  // PRD-11: the task's checklist, in stored order. Embedded for the same reason
  // as creator/assignee — the client replaces whole task objects after a
  // mutation, so a response without them would wipe the list.
  subtasks: SubtaskResponse[];
  creator: UserRefResponse | null;
  assignee: UserRefResponse | null;
  due_date: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
};

// PRD-11 Phase 1.2: one checklist item. No created_at on purpose — the order is
// `position`, and a checklist row has no history worth surfacing yet.
export type SubtaskResponse = {
  id: string;
  title: string;
  done: boolean;
  position: number;
};

// PRD-11 Phase 1.3: one stored file. `size_bytes` is what the server measured on
// the way into the bucket, never what the client claimed — the quota sum depends
// on that. The storage key is deliberately NOT exposed: it is server-internal
// addressing and tells a client nothing it needs.
export type AttachmentResponse = {
  id: string;
  task_id: string | null;
  comment_id: string | null;
  filename: string;
  size_bytes: number;
  content_type: string;
  uploader: UserRefResponse;
  created_at: string;
};

export type ProjectResponse = {
  id: string;
  team_id: string;
  owner_id: string;
  owner_username: string;
  scope: string; // "team" | "personal"
  name: string;
  color: string | null;
  archived: boolean;
  task_count: number;
  task_done_count: number;
  created_at: string;
  updated_at: string;
};

export type KpiResponse = {
  id: string;
  team_id: string;
  owner_id: string;
  owner_username: string;
  name: string;
  binding_count: number;
  created_at: string;
  updated_at: string;
};

export type TaskKpiResponse = { kpi_id: string; name: string; weight: number };

export type CommentResponse = {
  id: string;
  task_id: string;
  author_id: string;
  author: UserResponse;
  parent_id: string | null;
  body: string;
  // PRD-11: files attached to this comment (images preview, everything else
  // downloads). Embedded like subtasks — the client replaces whole comment
  // objects after a mutation, so a response without them would wipe the list.
  attachments: AttachmentResponse[];
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

export type AnalyticsResponse = {
  range: number;
  series: AnalyticsSeriesItem[];
  totals: {
    open: number;
    in_progress: number;
    completed: number;
    canceled: number;
  };
};

export function toNotification(
  n: Pick<PrismaNotification, "id" | "type" | "payload" | "readAt" | "createdAt">
): NotificationResponse {
  return {
    id: n.id,
    type: n.type,
    payload: n.payload,
    read_at: n.readAt ? n.readAt.toISOString() : null,
    created_at: n.createdAt.toISOString(),
  };
}

export interface NotificationResponse {
  id: string;
  type: string;
  payload: unknown; // the drawer renders optional fields off it
  read_at: string | null;
  created_at: string;
}

export function toUser(
  u: Pick<PrismaUser, "id" | "username" | "displayName" | "createdAt">
): UserResponse {
  return {
    id: u.id,
    username: u.username,
    display_name: u.displayName,
    created_at: u.createdAt.toISOString(),
  };
}

// PRD-13: the first-run tour's dismissal state. The DB CHECK allows exactly
// these two values or NULL.
export type TourState = "completed" | "skipped";

// The SESSION user: what GET /me, signup, login and PATCH /me hand back. This
// is deliberately not toUser() widened — toUser is embedded in comment payloads
// (toComment), so putting the tour flag on it would leak one user's onboarding
// state into every comment and force every comment query to select the column.
// Two mappers, two audiences.
export type MeResponse = UserResponse & {
  tour_state: TourState | null;
  tour_resolved_at: string | null;
};

export function toMe(
  u: Pick<
    PrismaUser,
    "id" | "username" | "displayName" | "createdAt" | "tourState" | "tourResolvedAt"
  >
): MeResponse {
  return {
    ...toUser(u),
    // Narrowed by comparison, never cast. A value outside the enum cannot exist
    // (the CHECK forbids it) but if one ever did — a hand-written UPDATE, say —
    // it reads as NULL, which means "show the tour". Non-destructive, and the
    // same posture effectivePlan() takes with a garbage plan_override.
    tour_state: u.tourState === "completed" || u.tourState === "skipped" ? u.tourState : null,
    tour_resolved_at: u.tourResolvedAt ? u.tourResolvedAt.toISOString() : null,
  };
}

// member_count is not on the row — callers pass the count they already have
// (list route group-bys it, detail route uses its members array, create is 1).
// member_limit likewise comes from lib/entitlements, never from the row.
// Both are required: a caller that has not thought about which plan governs the
// team must fail to compile rather than silently report unlimited.
export function toTeam(
  t: PrismaTeam,
  memberCount: number,
  memberLimit: number | null
): TeamResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    owner_id: t.ownerId,
    kind: t.kind,
    has_logo: t.logoKey !== null,
    member_count: memberCount,
    member_limit: memberLimit,
    created_at: t.createdAt.toISOString(),
  };
}

export function toTeamMember(
  m: PrismaTeamMember & { user: Pick<PrismaUser, "username" | "displayName"> }
): TeamMemberResponse {
  return {
    user_id: m.userId,
    username: m.user.username,
    display_name: m.user.displayName,
    role: m.role,
    joined_at: m.joinedAt.toISOString(),
  };
}

export function toInvitation(
  inv: PrismaTeamInvitation & {
    team?: Pick<PrismaTeam, "name">;
    inviter?: Pick<PrismaUser, "username">;
  }
): TeamInvitationResponse {
  return {
    id: inv.id,
    team_id: inv.teamId,
    team_name: inv.team?.name,
    inviter_id: inv.inviterId,
    inviter_name: inv.inviter?.username,
    invitee_username: inv.inviteeUsername,
    status: inv.status,
    created_at: inv.createdAt.toISOString(),
    expires_at: inv.expiresAt.toISOString(),
    responded_at: inv.respondedAt ? inv.respondedAt.toISOString() : null,
  };
}

export function toComment(
  c: PrismaComment & {
    author: Pick<PrismaUser, "id" | "username" | "displayName" | "createdAt">;
    attachments?: (PrismaAttachment & {
      uploader: Pick<PrismaUser, "id" | "username" | "displayName">;
    })[];
  }
): CommentResponse {
  return {
    id: c.id,
    task_id: c.taskId,
    author_id: c.authorId,
    author: toUser(c.author),
    parent_id: c.parentId,
    body: c.body,
    attachments: (c.attachments ?? [])
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toAttachment),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export function toAnalytics(
  a: Omit<AnalyticsResponse, "series"> & { series: AnalyticsSeriesItem[] }
): AnalyticsResponse {
  return a;
}

export type UserRefResponse = {
  id: string;
  username: string;
  display_name: string | null;
};

export function toUserRef(u: Pick<PrismaUser, "id" | "username" | "displayName">): UserRefResponse {
  return { id: u.id, username: u.username, display_name: u.displayName };
}

export function toTask(
  t: PrismaTask & {
    creator?: Pick<PrismaUser, "id" | "username" | "displayName"> | null;
    assignee?: Pick<PrismaUser, "id" | "username" | "displayName"> | null;
    subtaskItems?: PrismaSubtaskItem[];
  },
  kpis: TaskKpiResponse[] = []
): TaskResponse {
  return {
    id: t.id,
    team_id: t.teamId,
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    project_id: t.projectId,
    kpis,
    subtasks: (t.subtaskItems ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toSubtask),
    creator: t.creator ? toUserRef(t.creator) : null,
    assignee: t.assignee ? toUserRef(t.assignee) : null,
    due_date: t.dueDate ? t.dueDate.toISOString() : null,
    flagged: t.flagged,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

// Binding rows arrive as taskKpiBindings (include) — mapped here so routes
// stay one-liners.
export function toTaskKpi(b: PrismaTaskKpi & { kpi: Pick<PrismaKpi, "name"> }): TaskKpiResponse {
  return { kpi_id: b.kpiId, name: b.kpi.name, weight: b.weight };
}

// PRD-11 Phase 1.2: checklist row → API shape.
export function toSubtask(s: PrismaSubtaskItem): SubtaskResponse {
  return { id: s.id, title: s.title, done: s.done, position: s.position };
}

// PRD-11 Phase 1.3: attachment row → API shape (uploader must be included).
export function toAttachment(
  a: PrismaAttachment & { uploader: Pick<PrismaUser, "id" | "username" | "displayName"> }
): AttachmentResponse {
  return {
    id: a.id,
    task_id: a.taskId,
    comment_id: a.commentId,
    filename: a.filename,
    size_bytes: a.sizeBytes,
    content_type: a.contentType,
    uploader: toUserRef(a.uploader),
    created_at: a.createdAt.toISOString(),
  };
}

export function toProject(
  p: PrismaProject & {
    owner: Pick<PrismaUser, "username">;
    tasks?: { status: string }[];
  }
): ProjectResponse {
  const tasks = p.tasks ?? [];
  return {
    id: p.id,
    team_id: p.teamId,
    owner_id: p.ownerId,
    owner_username: p.owner.username,
    scope: p.scope,
    name: p.name,
    color: p.color,
    archived: p.archived,
    task_count: tasks.length,
    task_done_count: tasks.filter((t) => t.status === "done").length,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

export function toKpi(
  k: PrismaKpi & { owner: Pick<PrismaUser, "username"> },
  bindingCount = 0
): KpiResponse {
  return {
    id: k.id,
    team_id: k.teamId,
    owner_id: k.ownerId,
    owner_username: k.owner.username,
    name: k.name,
    binding_count: bindingCount,
    created_at: k.createdAt.toISOString(),
    updated_at: k.updatedAt.toISOString(),
  };
}
