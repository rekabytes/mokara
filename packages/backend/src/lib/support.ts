import { z } from "zod";
import { prisma } from "../db.ts";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Prisma, SupportTicket, SupportSite } from "@mokara/db/prisma/generated/client";
import { env, isHosted } from "../env.ts";
import { supportLimits as planSupportLimits } from "./plans.ts";
import type { PlanHolder } from "./plans.ts";
export function supportLimits(owner: PlanHolder) {
  return isHosted ? planSupportLimits(owner) : { sites: Infinity, tickets: Infinity };
}

export const SUPPORT_ATTACHMENT_BYTES = 3 * 1024 ** 2;
export const SUPPORT_ATTACHMENT_COUNT = 3;
export const SUPPORT_ACCESS_DAYS = 90;

export function supportConfigured() {
  try {
    return Boolean(
      env.AUTH_SECRET.length >= 32 &&
      (env.ENV !== "production" || env.AUTH_PROXY_SECRET.length >= 32) &&
      Buffer.from(env.SUPPORT_ENCRYPTION_KEY, "base64").length === 32 &&
      ["http:", "https:"].includes(new URL(env.AUTH_PUBLIC_URL).protocol) &&
      (env.ENV !== "production" || new URL(env.AUTH_PUBLIC_URL).protocol === "https:") &&
      new URL(env.SUPPORT_EMAIL_API_URL).protocol === "https:" &&
      env.SUPPORT_EMAIL_API_KEY &&
      env.SUPPORT_EMAIL_FROM
    );
  } catch {
    return false;
  }
}
export function supportHash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
function key() {
  const value = Buffer.from(env.SUPPORT_ENCRYPTION_KEY, "base64");
  if (value.length !== 32) throw new Error("Support encryption is not configured");
  return value;
}

export function encryptSupport(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("mokara:support:v1"));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((b) => b.toString("base64url")).join(".");
}
export function decryptSupport(value: string) {
  const [nonce, tag, bytes, extra] = value.split(".");
  if (!nonce || !tag || !bytes || extra) throw new Error("Invalid support ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from("mokara:support:v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bytes, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export function supportTicketUrl(ticket: Pick<SupportTicket, "id" | "accessEncrypted">) {
  const url = new URL(`/support-ticket/${ticket.id}`, env.AUTH_PUBLIC_URL);
  url.hash = decryptSupport(ticket.accessEncrypted);
  return url.toString();
}
export function supportSiteDto(site: SupportSite) {
  let formUrl = "";
  try {
    formUrl = new URL(`/ticket-form/${site.id}`, env.AUTH_PUBLIC_URL).toString();
  } catch {
    /* Inbox reads remain available during configuration repair. */
  }
  return {
    id: site.id,
    name: site.name,
    origins: site.origins,
    accent: site.accent,
    greeting: site.greeting,
    enabled: site.enabled,
    form_url: formUrl,
  };
}
export function supportTicketDto(ticket: SupportTicket) {
  return {
    id: ticket.id,
    reference: ticket.reference,
    site_id: ticket.siteId,
    subject: ticket.subject,
    details: ticket.details,
    request_type: ticket.requestType,
    area: ticket.area,
    customer_name: ticket.customerName,
    customer_email: ticket.customerEmail,
    status: ticket.status,
    priority: ticket.priority,
    assignee_id: ticket.assigneeId,
    task_id: ticket.taskId,
    created_at: ticket.createdAt.toISOString(),
    updated_at: ticket.updatedAt.toISOString(),
  };
}
export async function queueSupportEmail(
  tx: Prisma.TransactionClient,
  ticket: SupportTicket,
  text: string
) {
  // Callers hold the ticket row lock. Read the latest capability rather than
  // renewing a stale pre-lock snapshot and invalidating another queued update.
  ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  if (ticket.accessExpiresAt <= new Date()) {
    const token = randomBytes(32).toString("base64url");
    ticket = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        accessHash: supportHash(token),
        accessEncrypted: encryptSupport(token),
        accessExpiresAt: new Date(Date.now() + SUPPORT_ACCESS_DAYS * 86400_000),
      },
    });
  }
  await tx.supportEmail.create({
    data: {
      ticketId: ticket.id,
      recipient: ticket.customerEmail,
      subject: `Ticket ${ticket.reference}: ${ticket.subject}`,
      textEncrypted: encryptSupport(
        `${text}\n\nView your ticket and reply:\n${supportTicketUrl(ticket)}\n\nThis private link expires after ${SUPPORT_ACCESS_DAYS} days. Do not share it. Replies are accepted on the ticket page, not by email.`
      ),
    },
  });
}

export async function customerTicket(id: string, authorization: string | undefined) {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token || !z.uuid().safeParse(id).success) return null;
  return prisma.supportTicket.findFirst({
    where: { id, accessHash: supportHash(token), accessExpiresAt: { gt: new Date() } },
  });
}
