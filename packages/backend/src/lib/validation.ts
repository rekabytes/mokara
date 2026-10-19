import { z } from "zod";
import { newPasswordError } from "./password-policy.ts";
import { validScopes, parseScopes, MCP_SCOPES } from "../mcp/permissions.ts";

export const mcpScopesSchema = z
  .array(z.enum(MCP_SCOPES))
  .refine(validScopes, "Choose valid permissions including read access.");
const mcpScopeString = z
  .string()
  .max(200)
  .refine((raw) => validScopes(parseScopes(raw)), "Invalid MCP scope.");
const mcpRepositoriesSchema = z
  .array(z.uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length)
  .default([]);
import { PLAN_IDS } from "./plans.ts";

// Username: 3-20 chars, lowercase letters / digits / underscore, case-insensitive
// uniqueness is enforced by Postgres CITEXT. We lowercase+trim here so values
// match the index.
export const usernameSchema = z
  .string()
  .min(3, "username must be 3-20 chars")
  .max(20, "username must be 3-20 chars")
  .regex(/^[a-z0-9_]+$/, "username may only contain a-z, 0-9, underscore")
  .transform((s) => s.toLowerCase().trim());

export const passwordSchema = z.string().superRefine((password, ctx) => {
  const message = newPasswordError(password);
  if (message) ctx.addIssue({ code: "custom", message });
});

export const signUpSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  display_name: z.string().trim().max(50, "display name must be 50 characters or fewer").optional(),
  turnstile_token: z.string().min(1).max(2048).optional(),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "password is required"),
});

// PRD-08: the confirm-new-password match is checked client-side; the server
// only needs the two values it actually verifies.
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "current password is required"),
    new_password: passwordSchema,
  })
  .strict();

// PRD-08: display name is always present — null clears it, same rule as
// sign-up's optional field.
export const updateMeSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .max(50, "display name must be 50 characters or fewer")
      .nullable(),
  })
  .strict();

export const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "team name is required")
    .max(50, "team name must be 50 characters or fewer"),
  // PRD-06: the creation modal asks "individual or team". A team is born a
  // team (no members needed); a workspace stays private until an invite lands.
  kind: z.enum(["workspace", "team"]).default("team"),
});

export const inviteSchema = z.object({
  username: usernameSchema,
});

// Owner (2026-09-06): the last-selected-container pointer (PUT /me/last-
// container). Membership is checked in the route — the id must name a
// container the caller actually belongs to — so the schema only proves
// shape.
export const lastContainerSchema = z.object({ team_id: z.uuid() }).strict();

// PRD-13: the first-run tour's dismissal (PATCH /me/onboarding). Strict, and a
// closed enum on purpose — there is no `null` here, so nothing reachable with a
// user session can put the tour back. A replay affordance would be a separate,
// deliberate widening of this schema.
export const tourStateSchema = z
  .object({
    state: z.enum(["completed", "skipped"], {
      error: "state must be completed or skipped",
    }),
  })
  .strict();

export const respondSchema = z.object({
  action: z.enum(["accept", "decline"], { error: "action must be accept or decline" }),
});

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "canceled"], {
  error: "status must be todo, in_progress, done or canceled",
});
export const taskPrioritySchema = z.enum(["low", "medium", "high"], {
  error: "priority must be low, medium or high",
});

// Accept RFC3339 datetime strings (with offset) or null/undefined.
const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "due date must be a valid date")
  .nullable()
  .optional();

// Task → KPI bindings (PUT /tasks/:id/kpis replace-all, and optional on
// create). Per-task total ≤ 100 is a cross-item rule with its own error
// code, so the route checks it, not the schema.
export const taskKpiBindings = z
  .array(
    z.object({
      kpi_id: z.uuid(),
      weight: z.number().int().min(1, "weight must be 1–100").max(100, "weight must be 1–100"),
    })
  )
  .max(20, "a task can bind at most 20 KPIs");

export const taskKpisSchema = z.object({ kpis: taskKpiBindings });

export type TaskKpiBinding = z.infer<typeof taskKpiBindings>[number];

const taskTitle = z
  .string()
  .min(1, "title is required")
  .max(500, "Task titles must be 500 characters or fewer.");
const taskDescription = z
  .string()
  .max(20000, "Task descriptions must be 20,000 characters or fewer.");

export const createTaskSchema = z.object({
  title: taskTitle,
  description: taskDescription.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  due_date: isoDate,
  project_id: z.uuid().nullish(),
  // PRD-10: must be a member of the task's container — route-enforced.
  assignee_id: z.uuid().nullish(),
  kpis: taskKpiBindings.optional(),
});

export const githubIssueSchema = z
  .object({
    repository_id: z.uuid(),
    issue_number: z.number().int().min(1).max(2147483647).optional(),
  })
  .strict();
export const githubRepositoriesSchema = z
  .object({
    repository_ids: z
      .array(z.uuid())
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate repository"),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: taskTitle.optional(),
    description: taskDescription.nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    due_date: isoDate,
    project_id: z.uuid().nullish(),
    assignee_id: z.uuid().nullish(),
  })
  .strict();

// PRD-06: projects & KPIs. scope "team" additionally needs a team-kind
// container + owner role — that's DB state, so the routes enforce it (see
// guardContainerScope); the schema only pins the shape.
export const containerScopeSchema = z.enum(["team", "personal"]);

const projectColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb");

const projectName = z
  .string()
  .trim()
  .min(1, "project name is required")
  .max(50, "project name must be 50 characters or fewer");

const kpiName = z
  .string()
  .trim()
  .min(1, "kpi name is required")
  .max(60, "kpi name must be 60 characters or fewer");

export const createProjectSchema = z.object({
  name: projectName,
  color: projectColor.nullish(),
  scope: containerScopeSchema.default("personal"),
});

export const updateProjectSchema = z
  .object({
    name: projectName.optional(),
    color: projectColor.nullish(),
    archived: z.boolean().optional(),
  })
  .strict();

export const createKpiSchema = z.object({
  name: kpiName,
});

export const updateKpiSchema = z.object({ name: kpiName.optional() }).strict();

// Body rules shared by create and update — a PATCH without a new body is
// meaningless.
const commentBody = z
  .string()
  .trim()
  .min(1, "comment body is required")
  .max(2000, "comment body must be 2000 characters or fewer");

export const createCommentSchema = z.object({
  body: commentBody,
  // Optional reply target; must be a comment on the same task (checked in the
  // route). Replies to replies are flattened to the thread root there too.
  parent_id: z.uuid().optional(),
});

export const commentSchema = z.object({
  body: commentBody,
});

// PRD-11 Phase 1.2: checklist items. Title rules shared by create and update,
// same convention as commentBody. 200 chars keeps a subtask a step, not a
// paragraph — the task title itself is the longer field.
const subtaskTitle = z
  .string()
  .trim()
  .min(1, "subtask title is required")
  .max(200, "subtask title must be 200 characters or fewer");

export const createSubtaskSchema = z.object({ title: subtaskTitle });

export const updateSubtaskSchema = z
  .object({
    title: subtaskTitle.optional(),
    done: z.boolean().optional(),
  })
  .strict();

// Reorder: every id of the checklist in the order the client drew it. Partial
// orders are rejected in the route — a half-list would silently reshuffle.
export const orderSubtasksSchema = z
  .object({ ids: z.array(z.uuid()).min(1, "at least one id is required") })
  .strict();

// Operator console (packages/admin). Not the user-facing schemas above: the
// admin username is free-form (it is an env value, never a `users` row), and
// `url_key` is the secret carried by the login URL — the backend re-checks it
// so that finding the form is not enough to try passwords against it.
export const adminLoginSchema = z
  .object({
    username: z.string().min(1, "username is required").max(100, "username is too long"),
    password: z.string().min(1, "password is required").max(200, "password is too long"),
    url_key: z.string().min(1, "access key is required").max(200, "access key is too long"),
  })
  .strict();

// The plan override. The enum comes from lib/plans.ts — the one tier table — so
// the console can never write a value the DB CHECK would reject or that
// limitsFor() would silently read as the tightest tier.
export const adminPlanSchema = z.object({ plan: z.enum(PLAN_IDS) }).strict();
export const adminUserParamSchema = z.object({ id: z.uuid() }).strict();
const adminSearch = z.string().trim().max(100).default("");
export const adminSupportQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1), q: adminSearch })
  .strict();
export const adminBillingQuerySchema = adminSupportQuerySchema
  .extend({
    status: z
      .enum([
        "",
        "unknown",
        "none",
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "canceled",
        "paused",
        "incomplete",
        "incomplete_expired",
        "error",
        "canceling",
        "payment_failed",
        "grant",
      ])
      .default(""),
  })
  .strict();
export const adminAuditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    actor: adminSearch,
    user: adminSearch,
    action: z.enum(["", "plan_override_changed"]).default(""),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must not be after to",
  });
export const adminPageSchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();

// An agent receives read access only to explicit current memberships.
export const createMcpConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    workspace_ids: z
      .array(z.uuid())
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    expires_in_days: z.number().int().min(1).max(90).default(30),
    scopes: mcpScopesSchema.default(["mokara:read"]),
    repository_ids: mcpRepositoriesSchema,
  })
  .strict();

// Public MCP clients have no client secret; every authorization requires S256.
export const mcpOAuthRegisterSchema = z
  .object({
    client_name: z.string().trim().min(1).max(80).default("MCP client"),
    redirect_uris: z.array(z.string().min(1).max(2048)).min(1).max(10),
    token_endpoint_auth_method: z.literal("none").default("none"),
    // Native MCP clients (including Codex/rmcp) send this standard DCR metadata.
    // It is advisory only: all clients retain the same safe redirects and PKCE rules.
    application_type: z.enum(["native", "web"]).optional(),
    // Standard advisory metadata is validated but never fetched or trusted.
    client_uri: z.url().max(2048).optional(),
    logo_uri: z.url().max(2048).optional(),
    tos_uri: z.url().max(2048).optional(),
    policy_uri: z.url().max(2048).optional(),
    contacts: z.array(z.email().max(254)).max(10).optional(),
    software_id: z.string().max(256).optional(),
    software_version: z.string().max(80).optional(),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .min(1)
      .max(2)
      .refine(
        (types) => types.includes("authorization_code") && new Set(types).size === types.length
      )
      .default(["authorization_code", "refresh_token"]),
    response_types: z.array(z.literal("code")).length(1).default(["code"]),
    scope: mcpScopeString.optional(),
  })
  .strict();
export const mcpOAuthConsentSchema = z
  .object({
    request: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    approve: z.boolean(),
    scopes: mcpScopesSchema.default(["mokara:read"]),
    repository_ids: mcpRepositoriesSchema,
    workspace_ids: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
  })
  .strict();

export const mcpOAuthAuthorizeSchema = z
  .object({
    client_id: z.uuid(),
    response_type: z.literal("code"),
    redirect_uri: z.string().max(2048),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
    resource: z.string().max(2048),
    scope: mcpScopeString.default("mokara:read"),
    state: z.string().max(2048).optional(),
  })
  .strict();

export const mcpOAuthTokenSchema = z.discriminatedUnion("grant_type", [
  z
    .object({
      grant_type: z.literal("authorization_code"),
      client_id: z.uuid(),
      resource: z.string().max(2048),
      code: z.string().regex(/^mk_code_[A-Za-z0-9_-]{43}$/),
      redirect_uri: z.string().max(2048),
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      scope: mcpScopeString.optional(),
    })
    .strict(),
  z
    .object({
      grant_type: z.literal("refresh_token"),
      client_id: z.uuid(),
      resource: z.string().max(2048),
      refresh_token: z.string().regex(/^mk_ort_[A-Za-z0-9_-]{43}$/),
      scope: mcpScopeString.optional(),
    })
    .strict(),
]);
export const mcpOAuthRevokeSchema = z
  .object({
    client_id: z.uuid(),
    token: z.string().min(1).max(256),
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  })
  .strict();

const libraryName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\\/\u0000-\u001f\u007f]+$/, "Use a name without slashes or control characters.");
export const libraryTeamParam = z.object({ teamId: z.uuid() }).strict();
export const libraryItemParam = z.object({ teamId: z.uuid(), id: z.uuid() }).strict();
export const libraryListQuery = z
  .object({
    folder_id: z.uuid().optional(),
    q: z.string().trim().max(200).default(""),
    view: z.enum(["files", "trash"]).default("files"),
    type: z.enum(["all", "images", "pdf"]).default("all"),
    sort: z.enum(["newest", "oldest", "name", "largest"]).default("newest"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const libraryUploadQuery = z
  .object({ folder_id: z.uuid().optional(), upload_id: z.uuid() })
  .strict();
export const libraryFolderCreate = z
  .object({ name: libraryName, parent_id: z.uuid().nullable().default(null) })
  .strict();
export const libraryFolderPatch = z
  .object({ name: libraryName.optional(), parent_id: z.uuid().nullable().optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.parent_id !== undefined, "Choose a change.");
export const libraryFilePatch = z
  .object({ name: libraryName.optional(), folder_id: z.uuid().nullable().optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.folder_id !== undefined, "Choose a change.");

export const adminInvitationQuerySchema = z
  .object({
    invitation_page: z.coerce.number().int().min(1).max(100000).default(1),
    invitation_status: z.enum(["all", "pending", "accepted", "declined", "expired"]).default("all"),
  })
  .strict();

const supportOrigin = z
  .string()
  .max(300)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        u.origin === value &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)))
      );
    } catch {
      return false;
    }
  }, "Enter an exact HTTPS origin without a path.");
export const supportTeamParam = z.object({ teamId: z.uuid() });
export const supportItemParam = supportTeamParam.extend({ id: z.uuid() });
export const supportSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    origins: z.array(supportOrigin).min(1).max(10),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#6366f1"),
    greeting: z.string().trim().min(1).max(200).default("Report an issue or send a request."),
    enabled: z.boolean().default(true),
  })
  .strict();
export const supportSubmissionSchema = z
  .object({
    request_id: z.uuid(),
    subject: z.string().trim().min(1).max(200),
    details: z.string().trim().min(1).max(10000),
    request_type: z.enum(["Report a bug", "Request a feature", "Billing", "Other"]),
    area: z.string().trim().min(1).max(100),
    customer_name: z.string().trim().min(1).max(100),
    customer_email: z.email().max(254),
    turnstile_token: z.string().max(2048).optional(),
    website: z.string().max(200).default(""),
  })
  .strict();
export const supportPatchSchema = z
  .object({
    status: z.enum(["open", "in_progress", "waiting", "resolved"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignee_id: z.uuid().nullable().optional(),
  })
  .strict();
export const supportMessageSchema = z
  .object({
    request_id: z.uuid(),
    body: z.string().trim().min(1).max(10000),
    internal: z.boolean().default(false),
  })
  .strict();
export const supportPublicMessageSchema = supportMessageSchema.omit({ internal: true });
