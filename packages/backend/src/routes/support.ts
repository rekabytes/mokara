import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { prisma } from "../db.ts";
import { publishToTeam } from "../lib/events.ts";
import { TASK_INCLUDE, taskResponse } from "../lib/task-response.ts";
import { log } from "../lib/logger.ts";
import { validate } from "../lib/validate.ts";
import {
  supportTeamParam,
  supportItemParam,
  supportSiteSchema,
  supportPatchSchema,
  supportMessageSchema,
} from "../lib/validation.ts";
import {
  supportLimits,
  supportConfigured,
  supportSiteDto,
  supportTicketDto,
  queueSupportEmail,
} from "../lib/support.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { publicCap } from "../lib/plans.ts";
import { collectionPage, collectionAfter, collectionCursor } from "../lib/collection-page.ts";
import type { Vars } from "../middleware/auth.ts";

export const supportRoutes = new Hono<{ Variables: Vars }>();
const base = "/teams/:teamId/support";
supportRoutes.use(
  `${base}/*`,
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) =>
      c.json({ error: "payload_too_large", message: "The request is too large." }, 413),
  })
);
supportRoutes.use(`${base}/*`, async (c, next) => {
  const params = supportTeamParam.safeParse(c.req.param());
  if (!params.success)
    return c.json({ error: "invalid_input", message: "Invalid workspace." }, 400);
  if (!(await getTeamRole(c.get("userId"), params.data.teamId)))
    return c.json({ error: "forbidden", message: "You are not a member of this workspace." }, 403);
  c.header("Cache-Control", "private, no-store");
  await next();
});
supportRoutes.get(`${base}/sites`, validate("param", supportTeamParam), async (c) => {
  const { teamId } = c.req.valid("param");
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { owner: true } });
  if (!team) return c.json({ error: "not_found", message: "Workspace not found." }, 404);
  const limits = supportLimits(team.owner),
    now = new Date();
  const [sites, ownedSites, tickets] = await Promise.all([
    prisma.supportSite.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } }),
    prisma.supportSite.count({ where: { team: { ownerId: team.ownerId } } }),
    prisma.supportTicket.count({
      where: {
        ownerId: team.ownerId,
        createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) },
      },
    }),
  ]);
  return c.json({
    sites: sites.map(supportSiteDto),
    owner: team.ownerId === c.get("userId"),
    configured: supportConfigured(),
    usage: {
      sites: ownedSites,
      site_limit: publicCap(limits.sites),
      tickets,
      ticket_limit: publicCap(limits.tickets),
    },
  });
});
supportRoutes.post(
  `${base}/sites`,
  validate("param", supportTeamParam),
  validate("json", supportSiteSchema),
  async (c) => {
    const { teamId } = c.req.valid("param"),
      userId = c.get("userId"),
      input = c.req.valid("json");
    if ((await getTeamRole(userId, teamId)) !== "owner")
      return c.json(
        { error: "forbidden", message: "Only the workspace owner can configure websites." },
        403
      );
    if (!supportConfigured())
      return c.json(
        {
          error: "support_unavailable",
          message: "Support email and the public URL must be configured before adding a website.",
        },
        503
      );
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const team = await tx.team.findFirst({
        where: { id: teamId, ownerId: userId },
        include: { owner: true },
      });
      if (!team) return null;
      const count = await tx.supportSite.count({ where: { team: { ownerId: userId } } });
      if (count >= supportLimits(team.owner).sites) return null;
      return tx.supportSite.create({
        data: {
          teamId,
          name: input.name,
          origins: input.origins,
          accent: input.accent,
          greeting: input.greeting,
          enabled: input.enabled,
        },
      });
    });
    if (!result)
      return c.json(
        {
          error: "support_limit",
          message: "The owner's shared website allowance has been reached.",
        },
        409
      );
    return c.json({ site: supportSiteDto(result) }, 201);
  }
);
supportRoutes.put(
  `${base}/sites/:id`,
  validate("param", supportItemParam),
  validate("json", supportSiteSchema),
  async (c) => {
    const { teamId, id } = c.req.valid("param");
    if ((await getTeamRole(c.get("userId"), teamId)) !== "owner")
      return c.json(
        { error: "forbidden", message: "Only the workspace owner can configure websites." },
        403
      );
    const result = await prisma.supportSite.updateMany({
      where: { id, teamId },
      data: c.req.valid("json"),
    });
    if (!result.count) return c.json({ error: "not_found", message: "Website not found." }, 404);
    return c.json({ ok: true });
  }
);
supportRoutes.get(`${base}/tickets`, validate("param", supportTeamParam), async (c) => {
  const { teamId } = c.req.valid("param"),
    scope = `support:${teamId}`;
  const page = collectionPage(c.req.query(), scope);
  if (!page) return c.json({ error: "invalid_input", message: "Invalid ticket page." }, 400);
  const rows = await prisma.supportTicket.findMany({
    where: { teamId, ...collectionAfter(page.cursor, "desc") },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
  });
  const more = rows.length > page.limit;
  if (more) rows.pop();
  const last = rows.at(-1);
  return c.json({
    tickets: rows.map(supportTicketDto),
    next_cursor: more && last ? collectionCursor(scope, last) : null,
  });
});
supportRoutes.get(`${base}/tickets/:id`, validate("param", supportItemParam), async (c) => {
  const { teamId, id } = c.req.valid("param");
  const ticket = await prisma.supportTicket.findFirst({ where: { id, teamId } });
  if (!ticket) return c.json({ error: "not_found", message: "Ticket not found." }, 404);
  const scope = `support-team-messages:${id}`,
    page = collectionPage(c.req.query(), scope);
  if (!page) return c.json({ error: "invalid_input", message: "Invalid message page." }, 400);
  const rows = await prisma.supportMessage.findMany({
    where: { ticketId: id, ...collectionAfter(page.cursor, "asc") },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: page.limit + 1,
  });
  const more = rows.length > page.limit;
  if (more) rows.pop();
  const last = rows.at(-1);
  const attachments = await prisma.workspaceFile.findMany({
    where: { supportTicketId: id, teamId, trashedAt: null },
    take: 3,
  });
  const email = await prisma.supportEmail.findFirst({
    where: { ticketId: id },
    orderBy: { createdAt: "desc" },
    select: { sentAt: true, attempts: true },
  });
  return c.json({
    ticket: supportTicketDto(ticket),
    messages: rows.map((m) => ({
      id: m.id,
      author: m.author,
      internal: m.internal,
      body: m.body,
      created_at: m.createdAt.toISOString(),
    })),
    next_cursor: more && last ? collectionCursor(scope, last) : null,
    attachments: attachments.map((f) => ({ id: f.id, name: f.name, size_bytes: f.sizeBytes })),
    email_status: !email
      ? "none"
      : email.sentAt
        ? "sent"
        : email.attempts >= 12
          ? "failed"
          : "queued",
  });
});
supportRoutes.patch(
  `${base}/tickets/:id`,
  validate("param", supportItemParam),
  validate("json", supportPatchSchema),
  async (c) => {
    const { teamId, id } = c.req.valid("param"),
      input = c.req.valid("json");
    if (input.assignee_id && !(await getTeamRole(input.assignee_id, teamId)))
      return c.json(
        { error: "assignee_not_member", message: "Choose a member of this workspace." },
        400
      );
    const changed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id}::uuid AND team_id = ${teamId}::uuid FOR UPDATE`;
      const ticket = await tx.supportTicket.findFirst({ where: { id, teamId } });
      if (!ticket) return null;
      const statusChanged = input.status !== undefined && input.status !== ticket.status;
      if (statusChanged && !supportConfigured()) return "unavailable";
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: input.status, priority: input.priority, assigneeId: input.assignee_id },
      });
      if (statusChanged)
        await queueSupportEmail(
          tx,
          updated,
          `Your ticket status is now ${updated.status.replaceAll("_", " ")}.`
        );
      return updated;
    });
    if (changed === "unavailable")
      return c.json(
        {
          error: "support_unavailable",
          message: "Email delivery is not configured. Try again later.",
        },
        503
      );
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "not_found", message: "Ticket not found." }, 404);
  }
);
supportRoutes.post(
  `${base}/tickets/:id/messages`,
  validate("param", supportItemParam),
  validate("json", supportMessageSchema),
  async (c) => {
    const { teamId, id } = c.req.valid("param"),
      input = c.req.valid("json");
    const user = await prisma.user.findUnique({ where: { id: c.get("userId") } });
    const ticket = await prisma.supportTicket.findFirst({ where: { id, teamId } });
    if (!ticket || !user) return c.json({ error: "not_found", message: "Ticket not found." }, 404);
    if (!input.internal && !supportConfigured())
      return c.json(
        { error: "support_unavailable", message: "Email delivery is not configured." },
        503
      );
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.supportMessage.findUnique({
        where: { requestId: input.request_id },
      });
      if (existing)
        return (
          existing.ticketId === id &&
          existing.internal === input.internal &&
          existing.body === input.body
        );
      await tx.supportMessage.create({
        data: {
          ticketId: id,
          requestId: input.request_id,
          author: user.displayName || user.username,
          body: input.body,
          internal: input.internal,
        },
      });
      if (!input.internal) {
        await tx.supportTicket.update({ where: { id }, data: { status: "waiting" } });
        await queueSupportEmail(tx, ticket, `The support team replied:\n\n${input.body}`);
      }
      return true;
    });
    return saved
      ? c.json({ ok: true })
      : c.json(
          { error: "support_conflict", message: "This request identifier is already in use." },
          409
        );
  }
);
supportRoutes.post(`${base}/tickets/:id/task`, validate("param", supportItemParam), async (c) => {
  const { teamId, id } = c.req.valid("param"),
    userId = c.get("userId");
  // Lock the ticket around task creation so retries cannot create extra tasks.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id}::uuid AND team_id = ${teamId}::uuid FOR UPDATE`;
    const ticket = await tx.supportTicket.findFirst({ where: { id, teamId } });
    if (!ticket) return null;
    if (ticket.taskId) return { task_id: ticket.taskId, created: false };
    const task = await tx.task.create({
      data: {
        teamId,
        creatorId: userId,
        title: ticket.subject,
        description: `Support ticket ${ticket.reference}\n\n${ticket.details}`,
        priority: ticket.priority,
      },
    });
    await tx.taskEvent.create({
      data: { teamId, taskId: task.id, actorId: userId, fromStatus: null, toStatus: "todo" },
    });
    await tx.supportTicket.update({ where: { id }, data: { taskId: task.id } });
    return { task_id: task.id, created: true };
  });
  if (!result) return c.json({ error: "not_found", message: "Ticket not found." }, 404);
  // Same best-effort live board delivery as normal task creation. The committed
  // task remains the source of truth if Redis publication is unavailable.
  if (result.created) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: result.task_id },
        include: TASK_INCLUDE,
      });
      if (task) await publishToTeam(teamId, { event: "task_created", data: taskResponse(task) });
    } catch {
      log.warn("Support task live update was not published; refresh the board.");
    }
  }
  return c.json({ task_id: result.task_id });
});
