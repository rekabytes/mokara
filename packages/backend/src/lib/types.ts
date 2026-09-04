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
  member_count: number;
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
  creator: UserRefResponse | null;
  assignee: UserRefResponse | null;
  due_date: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
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

// member_count is not on the row — callers pass the count they already have
// (list route group-bys it, detail route uses its members array, create is 1).
export function toTeam(t: PrismaTeam, memberCount = 1): TeamResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    owner_id: t.ownerId,
    kind: t.kind,
    member_count: memberCount,
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
  }
): CommentResponse {
  return {
    id: c.id,
    task_id: c.taskId,
    author_id: c.authorId,
    author: toUser(c.author),
    parent_id: c.parentId,
    body: c.body,
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
