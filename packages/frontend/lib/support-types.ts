import { z } from "zod";
export const supportSiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  origins: z
    .array(
      z.string().refine((value) => {
        try {
          const url = new URL(value);
          return ["https:", "http:"].includes(url.protocol) && url.origin === value;
        } catch {
          return false;
        }
      })
    )
    .min(1)
    .max(10),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  button_text_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  greeting: z.string(),
  enabled: z.boolean(),
  form_url: z.string(),
});
export const supportTicketSchema = z.object({
  id: z.string(),
  reference: z.string(),
  site_id: z.string(),
  subject: z.string(),
  details: z.string(),
  request_type: z.string(),
  area: z.string(),
  customer_name: z.string(),
  customer_email: z.string(),
  status: z.enum(["open", "in_progress", "waiting", "resolved"]),
  priority: z.enum(["low", "medium", "high"]),
  assignee_id: z.string().nullable(),
  task_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const supportMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  created_at: z.string(),
  internal: z.boolean().optional(),
});
const file = z.object({ id: z.string(), name: z.string(), size_bytes: z.number() });
export const supportSitesSchema = z.object({
  sites: z.array(supportSiteSchema),
  owner: z.boolean(),
  configured: z.boolean(),
  usage: z.object({
    sites: z.number(),
    site_limit: z.number().nullable(),
    tickets: z.number(),
    ticket_limit: z.number().nullable(),
  }),
});
export const supportListSchema = z.object({
  tickets: z.array(supportTicketSchema),
  next_cursor: z.string().nullable(),
});
export const supportDetailSchema = z.object({
  ticket: supportTicketSchema,
  messages: z.array(supportMessageSchema),
  attachments: z.array(file),
  next_cursor: z.string().nullable(),
  email_status: z.enum(["none", "queued", "sent", "failed"]),
});
export const supportConfigSchema = z.object({
  site: supportSiteSchema.omit({ form_url: true, enabled: true }),
  protection: z.object({ required: z.boolean(), site_key: z.string().nullable() }),
  available: z.boolean(),
  max_file_bytes: z.number(),
  max_files: z.number(),
});
export const supportSubmissionResultSchema = z.object({
  ticket: supportTicketSchema,
  ticket_url: z.url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
});
export const supportPublicDetailSchema = z.object({
  ticket: supportTicketSchema.pick({
    id: true,
    reference: true,
    subject: true,
    details: true,
    status: true,
    created_at: true,
  }),
  site_name: z.string(),
  messages: z.array(supportMessageSchema),
  attachments: z.array(file),
  next_cursor: z.string().nullable(),
});
export const supportOkSchema = z.object({ ok: z.literal(true) });
export const supportTaskSchema = z.object({ task_id: z.string() });
export const supportFileSchema = z.instanceof(Blob);
export type SupportSite = z.infer<typeof supportSiteSchema>;
export type SupportTicket = z.infer<typeof supportTicketSchema>;
export type SupportConfig = z.infer<typeof supportConfigSchema>;
export type SupportDetail = z.infer<typeof supportDetailSchema>;
export type SupportSiteDraft = Pick<
  SupportSite,
  "name" | "origins" | "accent" | "button_text_color" | "greeting" | "enabled"
>;
export type SupportSubmission = {
  request_id: string;
  subject: string;
  details: string;
  request_type: string;
  area: string;
  customer_name: string;
  customer_email: string;
  website: string;
  turnstile_token?: string;
};
