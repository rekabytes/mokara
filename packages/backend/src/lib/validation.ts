import { z } from "zod";

// Username: 3-20 chars, lowercase letters / digits / underscore, case-insensitive
// uniqueness is enforced by Postgres CITEXT. We lowercase+trim here so values
// match the index.
export const usernameSchema = z
  .string()
  .min(3, "username must be 3-20 chars")
  .max(20, "username must be 3-20 chars")
  .regex(/^[a-z0-9_]+$/, "username may only contain a-z, 0-9, underscore")
  .transform((s) => s.toLowerCase().trim());

export const passwordSchema = z.string().min(8, "password must be at least 8 characters");

export const signUpSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  display_name: z.string().trim().max(50, "display name must be 50 characters or fewer").optional(),
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

export const createTaskSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  due_date: isoDate,
  project_id: z.uuid().nullish(),
  kpis: taskKpiBindings.optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1, "title is required").optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    due_date: isoDate,
    project_id: z.uuid().nullish(),
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
