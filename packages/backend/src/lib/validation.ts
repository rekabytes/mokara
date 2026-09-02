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
  display_name: z.string().trim().max(50).optional(),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

export const inviteSchema = z.object({
  username: usernameSchema,
});

export const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "canceled"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

// Accept RFC3339 datetime strings (with offset) or null/undefined.
const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be ISO 8601 datetime")
  .nullable()
  .optional();

export const createTaskSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  due_date: isoDate,
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    due_date: isoDate,
  })
  .strict();

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
