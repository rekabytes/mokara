import { MCP_SCOPES } from "./mcp-permissions";
import { z } from "zod";
import type {
  McpConnection,
  Analytics,
  BillingInfo,
  GitHubIntegration,
  Progress,
  Task,
  TeamDetail,
  Attachment,
  Comment,
  NotificationInfo,
  Project,
  Kpi,
  KpiProgress,
  SessionUser,
} from "./api-types";

const userRef = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable(),
});

export const sessionUserSchema = userRef.extend({
  created_at: z.string(),
  password_login_enabled: z.boolean(),
  username_claimed: z.boolean(),
  tour_state: z.enum(["completed", "skipped"]).nullable(),
  tour_resolved_at: z.string().nullable(),
}) satisfies z.ZodType<SessionUser>;
export const sessionSchema = z.object({ user: sessionUserSchema });

const owned = z.object({
  id: z.string(),
  team_id: z.string(),
  owner_id: z.string(),
  owner_username: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
const projectSchema = owned.extend({
  scope: z.enum(["team", "personal"]),
  color: z.string().nullable(),
  archived: z.boolean(),
  task_count: z.number().int().nonnegative(),
  task_done_count: z.number().int().nonnegative(),
}) satisfies z.ZodType<Project>;
const kpiSchema = owned.extend({
  binding_count: z.number().int().nonnegative(),
}) satisfies z.ZodType<Kpi>;
const kpiProgressSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner_username: z.string(),
  task_count: z.number().int().nonnegative(),
  weight_sum: z.number().nonnegative(),
  progress: z.number().min(0).max(100),
}) satisfies z.ZodType<KpiProgress>;
export const projectsSchema = z.object({ projects: z.array(projectSchema) });
export const kpisSchema = z.object({ kpis: z.array(kpiSchema) });
export const kpiProgressListSchema = z.object({ kpis: z.array(kpiProgressSchema) });

export const attachmentSchema = z.object({
  id: z.string(),
  task_id: z.string().nullable(),
  filename: z.string(),
  size_bytes: z.number().int().nonnegative(),
  content_type: z.string(),
  uploader: userRef,
  created_at: z.string(),
}) satisfies z.ZodType<Attachment>;

export const commentSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  author_id: z.string(),
  author: userRef.extend({ created_at: z.string() }),
  parent_id: z.string().nullable(),
  body: z.string(),
  attachments: z.array(attachmentSchema),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Comment>;

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z
    .object({
      actor_username: z.string().optional(),
      team_name: z.string().optional(),
      team_id: z.string().optional(),
      task_id: z.string().optional(),
      task_title: z.string().optional(),
      snippet: z.string().optional(),
      invitation_id: z.string().optional(),
      responded: z.string().optional(),
      due_date: z.string().optional(),
      overdue: z.boolean().optional(),
    })
    .passthrough(),
  read_at: z.string().nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<NotificationInfo>;

export const notificationListSchema = z.object({
  notifications: z.array(notificationSchema),
  unread_count: z.number().int().nonnegative(),
});
export const notificationReadSchema = z.object({ marked: z.number().int().nonnegative() });
export const attachmentsSchema = z.object({ attachments: z.array(attachmentSchema) });
export const commentsSchema = z.object({ comments: z.array(commentSchema) });
export const uploadSchema = z.object({ attachment: attachmentSchema });

const count = z.number().int().nonnegative();
const cap = count.nullable();
const role = z.enum(["owner", "member"]);
const status = z.enum(["todo", "in_progress", "done", "canceled"]);
const provider = z.enum(["google", "github"]);
export const emptySchema = z.void();
// A referenced project is archived instead of removed; both are successful.
export const projectDeletionSchema = z
  .union([emptySchema, z.object({ project: projectSchema })])
  .transform(() => undefined);
export const projectResultSchema = z.object({ project: projectSchema });
export const kpiResultSchema = z.object({ kpi: kpiSchema });
export const commentResultSchema = z.object({ comment: commentSchema });
export const socialProvidersSchema = z.object({
  providers: z.array(z.object({ provider, enabled: z.boolean() })),
});
export const socialConnectionsSchema = z.object({
  connections: z.array(z.object({ provider: z.string(), email: z.string().nullable() })),
});
export const pendingSocialSchema = z.object({
  provider,
  email: z.string(),
  display_name: z.string(),
});
export const completeSocialSchema = sessionSchema.extend({
  redirect: z
    .string()
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"),
      "Expected local return path"
    ),
});
export const signupProtectionSchema = z
  .object({ required: z.boolean(), site_key: z.string().nullable() })
  .refine((value) => !value.required || Boolean(value.site_key));
export const navigationSchema = z.object({
  url: z
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Expected HTTPS provider URL"),
});
export const sessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      device: z.string(),
      created_at: z.string(),
      last_seen_at: z.string(),
      current: z.boolean(),
    })
  ),
});
const capsSchema = z.object({ members: cap, teams: cap, storage_bytes: cap, file_bytes: cap });
export const billingSchema = z.object({
  plan: z.string(),
  billing_configured: z.boolean(),
  checkout_configured: z.boolean(),
  has_subscription: z.boolean(),
  period_end: z.string().nullable(),
  grace_until: z.string().nullable(),
  caps: capsSchema,
  plans: z.record(z.string(), capsSchema),
}) satisfies z.ZodType<BillingInfo>;
export const githubIntegrationSchema = z.object({
  configured: z.boolean(),
  sync_configured: z.boolean(),
  repository_limit: count,
  connection: z
    .object({
      github_login: z.string(),
      status: z.string(),
      reauthorization_required: z.boolean(),
      repositories: z.array(
        z.object({
          id: z.string(),
          full_name: z.string(),
          private: z.boolean(),
          installation_account: z.string(),
          enabled: z.boolean(),
          available: z.boolean(),
        })
      ),
    })
    .nullable(),
}) satisfies z.ZodType<GitHubIntegration>;
const githubIssueSchema = z.object({
  status: z.enum(["creating", "linked", "failed"]),
  repository_id: z.string(),
  repository_full_name: z.string(),
  issue_number: count.nullable(),
  issue_url: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  last_error_code: z.string().nullable(),
  sync_status: z.enum(["idle", "pending", "synced", "paused", "failed"]),
  sync_error_code: z.string().nullable(),
  last_synced_at: z.string().nullable(),
});
export const githubIssueResultSchema = z.object({ github_issue: githubIssueSchema });
const subtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  position: count,
});
export const subtaskResultSchema = z.object({ subtask: subtaskSchema });
export const taskSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  title: z.string(),
  description: z.string(),
  status,
  priority: z.enum(["low", "medium", "high"]),
  project_id: z.string().nullable(),
  kpis: z.array(
    z.object({ kpi_id: z.string(), name: z.string(), weight: z.number().nonnegative() })
  ),
  subtasks: z.array(subtaskSchema),
  creator: userRef.nullable(),
  assignee: userRef.nullable(),
  due_date: z.string().nullable(),
  flagged: z.boolean(),
  github_issue: githubIssueSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Task>;
export const tasksSchema = z.array(taskSchema);
const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  owner_id: z.string(),
  kind: z.enum(["workspace", "team"]),
  has_logo: z.boolean(),
  member_count: count,
  member_limit: cap,
  created_at: z.string(),
});
export const teamResultSchema = z.object({ team: teamSchema });
export const teamsSchema = z.object({
  teams: z.array(teamSchema.extend({ role })),
  last_container_id: z.string().nullable(),
});
const invitationSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  team_name: z.string().optional(),
  inviter_id: z.string(),
  inviter_name: z.string().optional(),
  invitee_username: z.string(),
  status: z.enum(["pending", "accepted", "declined", "expired"]),
  created_at: z.string(),
  expires_at: z.string(),
  responded_at: z.string().nullable(),
});
export const invitationResultSchema = z.object({ invitation: invitationSchema });
export const invitationsSchema = z.object({ invitations: z.array(invitationSchema) });
export const invitationResponseSchema = z.object({
  invitation_id: z.string(),
  status: z.enum(["accepted", "declined"]),
  team_id: z.string().optional(),
});
export const teamDetailSchema = z.object({
  team: teamSchema,
  role,
  members: z.array(
    z.object({
      user_id: z.string(),
      username: z.string(),
      display_name: z.string().nullable(),
      role,
      joined_at: z.string(),
    })
  ),
  invitations: z.array(invitationSchema),
}) satisfies z.ZodType<TeamDetail>;
export const analyticsSchema = z.object({
  range: count,
  series: z.array(
    z.object({
      date: z.string(),
      created: count,
      in_progress: count,
      completed: count,
      canceled: count,
    })
  ),
  totals: z.object({ open: count, in_progress: count, completed: count, canceled: count }),
}) satisfies z.ZodType<Analytics>;
export const progressSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status,
      created_at: z.string(),
      started_at: z.string().nullable(),
      due_date: z.string(),
      completed_at: z.string().nullable(),
      due_changes: z.array(
        z.object({
          from_due: z.string().nullable(),
          to_due: z.string().nullable(),
          changed_at: z.string(),
        })
      ),
    })
  ),
}) satisfies z.ZodType<Progress>;

/** Validation failures use the same safe transport error as malformed JSON. */
export function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw { error: "invalid_response", message: "Unexpected server response.", status: 502 };
  }
  return result.data;
}

const mcpConnectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  workspace_ids: z.array(z.string().uuid()),
  created_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  revoked_at: z.iso.datetime().nullable(),
  access: z.enum(["read", "write"]),
  scopes: z.array(z.enum(MCP_SCOPES)).default(["mokara:read"]),
  repository_ids: z.array(z.uuid()).default([]),
}) satisfies z.ZodType<McpConnection>;
export const mcpConnectionsSchema = z.object({ connections: z.array(mcpConnectionSchema) });
export const mcpCredentialSchema = z.object({
  connection: mcpConnectionSchema,
  token: z.string().regex(/^mk_mcp_[A-Za-z0-9_-]{43}$/),
});

export const mcpConsentSchema = z.object({
  client: z.object({ id: z.uuid(), name: z.string(), redirect_uri: z.url() }),
  scope: z.string(),
  requested_scopes: z.array(z.enum(MCP_SCOPES)).default(["mokara:read"]),
  repositories: z
    .array(z.object({ id: z.uuid(), name: z.string(), private: z.boolean() }))
    .default([]),
  expires_in_days: z.literal(30),
  workspaces: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
// Consent alone may navigate to an approved agent callback, including native loopback.
export const mcpConsentResultSchema = z.object({
  url: z.string().refine((raw) => {
    try {
      const url = new URL(raw);
      return (
        !url.username &&
        !url.password &&
        !url.hash &&
        !/[\\\r\n]/.test(raw) &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }),
});

export const mcpRepositoriesSchema = z.object({
  repositories: z.array(z.object({ id: z.uuid(), name: z.string(), private: z.boolean() })),
});
export const mcpActivitySchema = z.object({
  activity: z.array(
    z.object({
      id: z.uuid(),
      connection_id: z.uuid(),
      workspace_id: z.uuid(),
      operation: z.string(),
      request_id: z.uuid(),
      status: z.enum(["pending", "succeeded", "failed"]),
      created_at: z.iso.datetime(),
      finished_at: z.iso.datetime().nullable(),
    })
  ),
});
