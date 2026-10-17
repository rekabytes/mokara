import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../db.ts";
import { validate } from "../lib/validate.ts";
import {
  customerTicket,
  SUPPORT_ATTACHMENT_BYTES,
  SUPPORT_ATTACHMENT_COUNT,
  supportHash,
} from "../lib/support.ts";
import { withStorageAccount, storageUploadDenial } from "../lib/quota.ts";
import { readUploadFile } from "../lib/upload-body.ts";
import { detectFileType } from "../lib/file-types.ts";
import { storageReady, putObject, getObjectStream } from "../lib/storage.ts";
import {
  safeLibraryFilename,
  downloadDisposition,
  UPLOAD_LEASE_MS,
} from "../lib/workspace-files.ts";

export const supportAttachmentRoutes = new Hono();
const ticketParam = z.object({ id: z.uuid() });
const fileParam = ticketParam.extend({ fileId: z.uuid() });
supportAttachmentRoutes.post(
  "/tickets/:id/files",
  validate("param", ticketParam),
  validate("query", z.object({ upload_id: z.uuid() })),
  async (c) => {
    const ticket = await customerTicket(c.req.valid("param").id, c.req.header("Authorization"));
    if (!ticket)
      return c.json(
        { error: "support_access", message: "This ticket link is invalid or expired." },
        403
      );
    if (!storageReady())
      return c.json(
        { error: "attachments_disabled", message: "Attachments are unavailable." },
        409
      );
    const file = await readUploadFile(c.req.raw, SUPPORT_ATTACHMENT_BYTES);
    if (!(file instanceof File))
      return c.json({ error: file.error, message: file.message }, file.status);
    const bytes = new Uint8Array(await file.arrayBuffer()),
      contentType = detectFileType(bytes);
    if (!contentType || (file.type && file.type !== contentType))
      return c.json(
        {
          error: "unsupported_type",
          message: "Choose a PNG, JPEG, GIF, WebP or PDF with matching contents.",
        },
        400
      );
    const uploadId = c.req.valid("query").upload_id,
      hash = supportHash(bytes);
    const keyPrefix = `teams/${ticket.teamId}/support/${ticket.id}/`;
    const prepared = await withStorageAccount(ticket.teamId, async (tx, account) => {
      const existing = await tx.workspaceFile.findUnique({ where: { uploadId } });
      if (existing)
        return existing.supportTicketId === ticket.id &&
          existing.contentHash === hash &&
          !existing.trashedAt
          ? { existing: true }
          : {
              error: "support_conflict",
              message: "This upload identifier is already in use.",
              status: 409 as const,
            };
      if (await tx.fileObjectDeletion.findUnique({ where: { uploadId } }))
        return {
          error: "file_upload_pending",
          message: "This upload is processing or being cleaned up.",
          status: 409 as const,
        };
      const [files, pending] = await Promise.all([
        tx.workspaceFile.count({ where: { supportTicketId: ticket.id } }),
        tx.fileObjectDeletion.count({ where: { storageKey: { startsWith: keyPrefix } } }),
      ]);
      if (files + pending >= SUPPORT_ATTACHMENT_COUNT)
        return {
          error: "support_limit",
          message: "This ticket already has the maximum number of attachments.",
          status: 409 as const,
        };
      const denied = await storageUploadDenial(account, file.size, 0, tx);
      if (denied) return denied;
      const id = crypto.randomUUID(),
        key = keyPrefix + id;
      const job = await tx.fileObjectDeletion.create({
        data: {
          ownerId: account.ownerId,
          teamId: ticket.teamId,
          uploadId,
          storageKey: key,
          sizeBytes: file.size,
          nextAttemptAt: new Date(Date.now() + UPLOAD_LEASE_MS),
        },
      });
      return { id, key, jobId: job.id };
    });
    if ("error" in prepared)
      return c.json({ error: prepared.error, message: prepared.message }, prepared.status);
    if ("existing" in prepared) return c.json({ ok: true });
    const abandon = async () => {
      try {
        await prisma.fileObjectDeletion.updateMany({
          where: { id: prepared.jobId },
          data: { nextAttemptAt: new Date() },
        });
      } catch {
        /* Durable lease expires after a crash. */
      }
    };
    try {
      await putObject({
        key: prepared.key,
        body: bytes,
        contentType,
        signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(UPLOAD_LEASE_MS)]),
      });
      const result = await withStorageAccount(ticket.teamId, async (tx, account) => {
        const reservation = await tx.fileObjectDeletion.findUnique({
          where: { id: prepared.jobId },
        });
        if (!reservation || reservation.attempts || reservation.nextAttemptAt <= new Date())
          return {
            error: "file_upload_expired",
            message: "This upload expired. Retry after cleanup.",
            status: 409 as const,
          };
        const current = await tx.supportTicket.findFirst({
          where: {
            id: ticket.id,
            teamId: ticket.teamId,
            accessHash: ticket.accessHash,
            accessExpiresAt: { gt: new Date() },
          },
        });
        if (!current)
          return {
            error: "support_access",
            message: "This ticket link is invalid or expired.",
            status: 403 as const,
          };
        const denied = await storageUploadDenial(account, file.size, file.size, tx);
        if (denied) return denied;
        await tx.workspaceFile.create({
          data: {
            id: prepared.id,
            teamId: ticket.teamId,
            supportTicketId: ticket.id,
            name: safeLibraryFilename(file.name),
            uploaderName: ticket.customerName,
            sizeBytes: file.size,
            contentType,
            contentHash: hash,
            uploadId,
            storageKey: prepared.key,
          },
        });
        await tx.fileObjectDeletion.delete({ where: { id: prepared.jobId } });
        return { ok: true };
      });
      if ("error" in result) {
        await abandon();
        return c.json({ error: result.error, message: result.message }, result.status);
      }
      return c.json(result, 201);
    } catch {
      await abandon();
      return c.json(
        {
          error: "storage_unavailable",
          message: "The attachment could not finish. Retry after cleanup.",
        },
        503
      );
    }
  }
);
supportAttachmentRoutes.get(
  "/tickets/:id/files/:fileId",
  validate("param", fileParam),
  async (c) => {
    const { id, fileId } = c.req.valid("param");
    const ticket = await customerTicket(id, c.req.header("Authorization"));
    if (!ticket)
      return c.json(
        { error: "support_access", message: "This ticket link is invalid or expired." },
        403
      );
    const file = await prisma.workspaceFile.findFirst({
      where: { id: fileId, supportTicketId: id, teamId: ticket.teamId, trashedAt: null },
    });
    if (!file) return c.json({ error: "not_found", message: "Attachment not found." }, 404);
    try {
      const object = await getObjectStream(file.storageKey, undefined, c.req.raw.signal);
      c.header("Content-Type", "application/octet-stream");
      c.header("Content-Disposition", downloadDisposition(file.name));
      c.header("X-Content-Type-Options", "nosniff");
      return c.body(object.body);
    } catch {
      return c.json(
        { error: "storage_unavailable", message: "This attachment is temporarily unavailable." },
        503
      );
    }
  }
);
