import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { getRedis } from "../redis.ts";
import { validate } from "../lib/validate.ts";
import { supportSubmissionSchema, supportPublicMessageSchema } from "../lib/validation.ts";
import {
  authClientIp,
  ipBucket,
  consumeAuthLimit,
  signupProtection,
  verifySignupChallenge,
} from "../lib/auth-protection.ts";
import {
  encryptSupport,
  supportHash,
  supportConfigured,
  supportLimits,
  supportTicketDto,
  supportTicketUrl,
  queueSupportEmail,
  customerTicket,
  SUPPORT_ACCESS_DAYS,
  SUPPORT_ATTACHMENT_BYTES,
  SUPPORT_ATTACHMENT_COUNT,
} from "../lib/support.ts";
import { supportAttachmentRoutes } from "./support-attachments.ts";
import { collectionPage, collectionAfter, collectionCursor } from "../lib/collection-page.ts";

export const supportPublicRoutes = new Hono();
supportPublicRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  // No browser session is accepted on this surface. Capability access is separate.
  let peer: string | undefined;
  try {
    peer = getConnInfo(c).remote.address;
  } catch {
    /* In-process tests have no socket. */
  }
  const ip = ipBucket(authClientIp(c.req.raw.headers, peer, env.AUTH_PROXY_SECRET));
  try {
    const retry = await consumeAuthLimit(
      getRedis(),
      c.req.method === "GET"
        ? c.req.path.includes("/sites/")
          ? "supportConfig"
          : "supportRead"
        : "supportPeer",
      ip,
      env.AUTH_SECRET
    );
    if (retry) {
      c.header("Retry-After", String(retry));
      return c.json(
        { error: "rate_limited", message: "Too many requests. Please try again shortly." },
        429
      );
    }
  } catch {
    return c.json(
      { error: "support_unavailable", message: "Support is temporarily unavailable." },
      503
    );
  }
  await next();
});
const siteParam = z.object({ id: z.uuid() });
supportPublicRoutes.get("/sites/:id", validate("param", siteParam), async (c) => {
  const site = await prisma.supportSite.findUnique({ where: { id: c.req.valid("param").id } });
  if (!site || !site.enabled)
    return c.json({ error: "not_found", message: "This ticket form is unavailable." }, 404);
  const protection = signupProtection(env);
  return c.json({
    site: {
      id: site.id,
      name: site.name,
      greeting: site.greeting,
      accent: site.accent,
      origins: site.origins,
    },
    protection: {
      required: protection.required,
      site_key: protection.configured ? protection.siteKey : null,
    },
    available: supportConfigured(),
    max_file_bytes: SUPPORT_ATTACHMENT_BYTES,
    max_files: SUPPORT_ATTACHMENT_COUNT,
  });
});
supportPublicRoutes.post(
  "/sites/:id/tickets",
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) =>
      c.json({ error: "payload_too_large", message: "The message is too large." }, 413),
  }),
  validate("param", siteParam),
  validate("json", supportSubmissionSchema),
  async (c) => {
    if (!supportConfigured())
      return c.json(
        {
          error: "support_unavailable",
          message: "Ticket submission is not configured. Please contact the website owner.",
        },
        503
      );
    const input = c.req.valid("json"),
      siteId = c.req.valid("param").id;
    if (input.website)
      return c.json({ error: "invalid_input", message: "Please submit the form again." }, 400);
    const site = await prisma.supportSite.findUnique({ where: { id: siteId } });
    if (!site || !site.enabled)
      return c.json({ error: "not_found", message: "This ticket form is unavailable." }, 404);
    try {
      const retry = await consumeAuthLimit(getRedis(), "supportSite", siteId, env.AUTH_SECRET);
      if (retry) {
        c.header("Retry-After", String(retry));
        return c.json(
          { error: "rate_limited", message: "This form is busy. Try again shortly." },
          429
        );
      }
    } catch {
      return c.json(
        { error: "support_unavailable", message: "Ticket submission is temporarily unavailable." },
        503
      );
    }
    const { request_id, turnstile_token, website: _website, ...fields } = input;
    const hash = supportHash(JSON.stringify(fields));
    const existing = await prisma.supportTicket.findUnique({ where: { submissionId: request_id } });
    if (existing) {
      if (existing.siteId !== siteId || existing.submissionHash !== hash)
        return c.json(
          { error: "support_conflict", message: "Start a new submission after changing the form." },
          409
        );
      return c.json({ ticket: supportTicketDto(existing), ticket_url: supportTicketUrl(existing) });
    }
    const verified = await verifySignupChallenge(turnstile_token, env, fetch, "support");
    if (verified !== "ok")
      return c.json(
        {
          error: verified === "invalid" ? "verification_failed" : "support_unavailable",
          message: "Complete the verification and try again.",
        },
        verified === "invalid" ? 400 : 503
      );
    const token = randomBytes(32).toString("base64url");
    const result = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({
        where: { id: site.teamId },
        include: { owner: true },
      });
      if (!team) return null;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${team.ownerId}::uuid FOR UPDATE`;
      const currentSite = await tx.supportSite.findUnique({ where: { id: siteId } });
      if (!currentSite?.enabled || currentSite.teamId !== team.id) return null;
      const owner = await tx.user.findUnique({ where: { id: team.ownerId } });
      if (!owner) return null;
      const duplicate = await tx.supportTicket.findUnique({ where: { submissionId: request_id } });
      if (duplicate)
        return duplicate.siteId === siteId && duplicate.submissionHash === hash ? duplicate : null;
      const now = new Date(),
        month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const count = await tx.supportTicket.count({
        where: { ownerId: team.ownerId, createdAt: { gte: month } },
      });
      if (count >= supportLimits(owner).tickets) return "limit";
      const ticket = await tx.supportTicket.create({
        data: {
          teamId: team.id,
          ownerId: team.ownerId,
          siteId,
          submissionId: request_id,
          submissionHash: hash,
          reference: `MK-${randomBytes(8).toString("hex").toUpperCase()}`,
          subject: fields.subject,
          details: fields.details,
          requestType: fields.request_type,
          area: fields.area,
          customerName: fields.customer_name,
          customerEmail: fields.customer_email,
          accessHash: supportHash(token),
          accessEncrypted: encryptSupport(token),
          accessExpiresAt: new Date(Date.now() + SUPPORT_ACCESS_DAYS * 86400_000),
        },
      });
      await tx.notification.create({
        data: {
          userId: team.ownerId,
          type: "support_ticket",
          payload: {
            actor_username: ticket.customerName,
            task_title: ticket.subject,
            team_id: team.id,
            team_name: team.name,
          },
        },
      });
      await queueSupportEmail(
        tx,
        ticket,
        `Your ticket was submitted to ${site.name}.\n\n${ticket.subject}\n\nWe'll send updates to this address.`
      );
      return ticket;
    });
    if (result === "limit")
      return c.json(
        {
          error: "support_limit",
          message:
            "This website cannot receive new tickets right now. Please contact the business directly.",
        },
        409
      );
    if (!result)
      return c.json(
        { error: "support_conflict", message: "This submission is unavailable. Try again." },
        409
      );
    return c.json({ ticket: supportTicketDto(result), ticket_url: supportTicketUrl(result) }, 201);
  }
);

// Ticket IDs are not credentials. Tokens travel only in Authorization headers;
// private links keep the token in the browser fragment, outside request logs.

supportPublicRoutes.get("/tickets/:id", validate("param", siteParam), async (c) => {
  const ticket = await customerTicket(c.req.valid("param").id, c.req.header("Authorization"));
  if (!ticket)
    return c.json(
      { error: "support_access", message: "This ticket link is invalid or expired." },
      403
    );
  const page = collectionPage(c.req.query(), `support-messages:${ticket.id}`);
  if (!page) return c.json({ error: "invalid_input", message: "Invalid message page." }, 400);
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: ticket.id, internal: false, ...collectionAfter(page.cursor, "asc") },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: page.limit + 1,
  });
  const more = messages.length > page.limit;
  if (more) messages.pop();
  const attachments = await prisma.workspaceFile.findMany({
    where: { supportTicketId: ticket.id, trashedAt: null },
    select: { id: true, name: true, sizeBytes: true },
    take: 3,
  });
  const site = await prisma.supportSite.findUnique({
    where: { id: ticket.siteId },
    select: { name: true },
  });
  return c.json({
    ticket: {
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      details: ticket.details,
      status: ticket.status,
      created_at: ticket.createdAt.toISOString(),
    },
    site_name: site?.name ?? "Support",
    attachments: attachments.map((f) => ({ id: f.id, name: f.name, size_bytes: f.sizeBytes })),
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      created_at: m.createdAt.toISOString(),
    })),
    next_cursor:
      more && messages.at(-1)
        ? collectionCursor(`support-messages:${ticket.id}`, messages[messages.length - 1])
        : null,
  });
});
supportPublicRoutes.post(
  "/tickets/:id/messages",
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) =>
      c.json({ error: "payload_too_large", message: "The message is too large." }, 413),
  }),
  validate("param", siteParam),
  validate("json", supportPublicMessageSchema),
  async (c) => {
    const ticket = await customerTicket(c.req.valid("param").id, c.req.header("Authorization"));
    if (!ticket)
      return c.json(
        { error: "support_access", message: "This ticket link is invalid or expired." },
        403
      );
    const input = c.req.valid("json");
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticket.id}::uuid FOR UPDATE`;
      const existing = await tx.supportMessage.findUnique({
        where: { requestId: input.request_id },
      });
      if (existing)
        return (
          existing.ticketId === ticket.id && !existing.internal && existing.body === input.body
        );
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          requestId: input.request_id,
          author: ticket.customerName,
          body: input.body,
        },
      });
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: "open" } });
      const team = await tx.team.findUnique({ where: { id: ticket.teamId } });
      if (team)
        await tx.notification.create({
          data: {
            userId: team.ownerId,
            type: "support_ticket",
            payload: {
              actor_username: ticket.customerName,
              task_title: ticket.subject,
              team_id: team.id,
              team_name: team.name,
            },
          },
        });
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
supportPublicRoutes.route("/", supportAttachmentRoutes);
