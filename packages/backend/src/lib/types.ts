// Response shapes. Keep these in sync with packages/frontend/lib/api.ts.
// Field names are snake_case to preserve the existing API contract — the
// frontend's `Task`, `Team`, etc. types depend on this exact shape.

import type {
  Task as PrismaTask,
  User as PrismaUser,
  Team as PrismaTeam,
  TeamMember as PrismaTeamMember,
  TeamInvitation as PrismaTeamInvitation,
  Comment as PrismaComment,
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
  due_date: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
};

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

export function toTeam(t: PrismaTeam): TeamResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    owner_id: t.ownerId,
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

export function toTask(t: PrismaTask): TaskResponse {
  return {
    id: t.id,
    team_id: t.teamId,
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate ? t.dueDate.toISOString() : null,
    flagged: t.flagged,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}
