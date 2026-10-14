import { Hono, type MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import { prisma } from "../db.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { validate } from "../lib/validate.ts";
import {
  libraryTeamParam,
  libraryItemParam,
  libraryListQuery,
  libraryUploadQuery,
  libraryFolderCreate,
  libraryFolderPatch,
  libraryFilePatch,
} from "../lib/validation.ts";
import {
  storageAccountForTeam,
  storageUploadDenial,
  usedBytes,
  usedBytesOfOwner,
  withStorageAccount,
  type StorageAccount,
} from "../lib/quota.ts";
import { publicCap } from "../lib/plans.ts";
import { storageReady, putObject, getObjectStream } from "../lib/storage.ts";
import { enqueueFileDeletion } from "../lib/file-cleanup.ts";
import {
  fileDenial,
  fileDto,
  folderDto,
  folderChain,
  descendants,
  validDestination,
  canManage,
  detectFileType,
  safeLibraryFilename,
  downloadDisposition,
  byteRange,
  FILE_PAGE_SIZE,
  MAX_FOLDER_DEPTH,
  MAX_FOLDERS,
  TRASH_DAYS,
  UPLOAD_LEASE_MS,
  type FileDenial,
} from "../lib/workspace-files.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";
import type { Vars } from "../middleware/auth.ts";

type Env = { Variables: Vars & { fileRole: string } };
export const fileRoutes = new Hono<Env>();
const base = "/teams/:teamId";
const access: MiddlewareHandler<Env> = async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const role = await getTeamRole(c.get("userId"), c.req.param("teamId") ?? "");
  if (!role)
    return c.json({ error: "forbidden", message: "You are not a member of this workspace." }, 403);
  c.set("fileRole", role);
  await next();
};
async function write<T>(
  teamId: string,
  userId: string,
  operation: (client: Prisma.TransactionClient, account: StorageAccount, role: string) => Promise<T>
): Promise<T | FileDenial> {
  return withStorageAccount(teamId, async (client, account) => {
    const member = await client.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
    if (!member)
      return fileDenial("forbidden", "You are no longer a member of this workspace.", 403);
    return operation(client, account, member.role);
  });
}

fileRoutes.get(
  `${base}/files`,
  validate("param", libraryTeamParam),
  access,
  validate("query", libraryListQuery),
  async (c) => {
    const { teamId } = c.req.valid("param");
    const query = c.req.valid("query");
    const userId = c.get("userId"),
      role = c.get("fileRole");
    const folders = await prisma.workspaceFolder.findMany({
      where: { teamId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const parent = query.folder_id ? folders.find((f) => f.id === query.folder_id) : null;
    if (
      query.folder_id &&
      (!parent || (query.view === "files" ? parent.trashedAt !== null : parent.trashedAt === null))
    )
      return c.json({ error: "not_found", message: "Folder not found." }, 404);
    const trash = query.view === "trash";
    const where: Prisma.WorkspaceFileWhereInput = {
      teamId,
      trashedAt: trash ? { not: null } : null,
      ...(query.q
        ? { name: { contains: query.q, mode: "insensitive" } }
        : query.folder_id
          ? { folderId: query.folder_id }
          : trash
            ? { OR: [{ folderId: null }, { folder: { trashedAt: null } }] }
            : { folderId: null }),
      ...(query.type === "images"
        ? { contentType: { startsWith: "image/" } }
        : query.type === "pdf"
          ? { contentType: "application/pdf" }
          : {}),
    };
    const orderBy: Prisma.WorkspaceFileOrderByWithRelationInput[] = [
      query.sort === "name"
        ? { name: "asc" }
        : query.sort === "largest"
          ? { sizeBytes: "desc" }
          : { createdAt: query.sort === "oldest" ? "asc" : "desc" },
      { id: "asc" },
    ];
    const account = await storageAccountForTeam(teamId);
    if (!account) return c.json({ error: "not_found", message: "Workspace not found." }, 404);
    const [files, total, ownerUsed, workspaceUsed] = await Promise.all([
      prisma.workspaceFile.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * FILE_PAGE_SIZE,
        take: FILE_PAGE_SIZE,
      }),
      prisma.workspaceFile.count({ where }),
      usedBytesOfOwner(account.ownerId),
      usedBytes(teamId),
    ]);
    return c.json({
      folders: folders.map((f) => folderDto(f, userId, role)),
      files: files.map((f) => fileDto(f, userId, role)),
      total,
      page: query.page,
      page_size: FILE_PAGE_SIZE,
      role,
      storage_configured: storageReady(),
      trash_days: TRASH_DAYS,
      usage: {
        account_used_bytes: ownerUsed,
        account_limit_bytes: publicCap(account.limits.storageBytes),
        workspace_used_bytes: workspaceUsed,
        file_limit_bytes: publicCap(account.limits.maxFileBytes),
      },
    });
  }
);

fileRoutes.post(
  `${base}/files`,
  validate("param", libraryTeamParam),
  access,
  validate("query", libraryUploadQuery),
  async (c) => {
    const { teamId } = c.req.valid("param");
    const { folder_id, upload_id } = c.req.valid("query");
    const userId = c.get("userId");
    if (!storageReady())
      return c.json(
        { error: "attachments_disabled", message: "File storage is not configured." },
        409
      );
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || file.size === 0)
      return c.json({ error: "invalid_input", message: "Choose a non-empty image or PDF." }, 400);
    const account = await storageAccountForTeam(teamId);
    if (!account) return c.json({ error: "not_found", message: "Workspace not found." }, 404);
    if (file.size > account.limits.maxFileBytes)
      return c.json(
        { error: "file_too_large", message: "That file exceeds this account's per-file limit." },
        400
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectFileType(bytes);
    if (!contentType || (file.type && file.type !== contentType))
      return c.json(
        {
          error: "unsupported_type",
          message: "Upload a PNG, JPEG, GIF, WebP image or PDF with matching file content.",
        },
        400
      );
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = safeLibraryFilename(file.name);
    const prepared = await write(teamId, userId, async (client, current, role) => {
      const existing = await client.workspaceFile.findUnique({ where: { uploadId: upload_id } });
      if (existing) {
        if (
          existing.teamId !== teamId ||
          existing.uploadedById !== userId ||
          existing.contentHash !== hash ||
          existing.trashedAt
        )
          return fileDenial("file_upload_conflict", "This upload identifier is already in use.");
        return { existing: fileDto(existing, userId, role) };
      }
      const pending = await client.fileObjectDeletion.findUnique({
        where: { uploadId: upload_id },
      });
      if (pending)
        return fileDenial(
          "file_upload_pending",
          "This upload is still processing or being cleaned up. Retry shortly."
        );
      const folders = await client.workspaceFolder.findMany({ where: { teamId } });
      const invalid = validDestination(folders, folder_id ?? null);
      if (invalid) return invalid;
      const denied = await storageUploadDenial(current, file.size, 0, client);
      if (denied) return denied;
      const id = crypto.randomUUID();
      const key = `teams/${teamId}/files/${id}`;
      const job = await client.fileObjectDeletion.create({
        data: {
          ownerId: current.ownerId,
          teamId,
          uploadId: upload_id,
          storageKey: key,
          sizeBytes: file.size,
          nextAttemptAt: new Date(Date.now() + UPLOAD_LEASE_MS),
        },
      });
      return { id, key, jobId: job.id };
    });
    if ("error" in prepared)
      return c.json({ error: prepared.error, message: prepared.message }, prepared.status);
    if ("existing" in prepared) return c.json({ file: prepared.existing }, 200);
    const abandon = async () => {
      try {
        await prisma.fileObjectDeletion.updateMany({
          where: { id: prepared.jobId },
          data: { nextAttemptAt: new Date() },
        });
      } catch {
        /* The durable reservation expires even if the database is temporarily unavailable. */
      }
    };
    try {
      await putObject({
        key: prepared.key,
        body: bytes,
        contentType,
        signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(UPLOAD_LEASE_MS)]),
      });
      const result = await write(teamId, userId, async (client, current, role) => {
        const reservation = await client.fileObjectDeletion.findUnique({
          where: { id: prepared.jobId },
        });
        if (!reservation || reservation.attempts || reservation.nextAttemptAt <= new Date())
          return fileDenial("file_upload_expired", "The upload expired. Retry it.");
        const folders = await client.workspaceFolder.findMany({ where: { teamId } });
        const invalid = validDestination(folders, folder_id ?? null);
        if (invalid) return invalid;
        const denied = await storageUploadDenial(current, file.size, file.size, client);
        if (denied) return denied;
        const user = await client.user.findUnique({
          where: { id: userId },
          select: { username: true, displayName: true },
        });
        if (!user) return fileDenial("forbidden", "Account unavailable.", 403);
        const row = await client.workspaceFile.create({
          data: {
            id: prepared.id,
            teamId,
            folderId: folder_id ?? null,
            name,
            uploadedById: userId,
            uploaderName: user.displayName || user.username,
            sizeBytes: file.size,
            contentType,
            contentHash: hash,
            uploadId: upload_id,
            storageKey: prepared.key,
          },
        });
        await client.fileObjectDeletion.delete({ where: { id: prepared.jobId } });
        return { file: fileDto(row, userId, role) };
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
          message:
            "The upload could not finish. Its reserved storage will be released after cleanup.",
        },
        503
      );
    }
  }
);

fileRoutes.patch(
  `${base}/files/:id`,
  validate("param", libraryItemParam),
  access,
  validate("json", libraryFilePatch),
  async (c) => {
    const { teamId, id } = c.req.valid("param"),
      change = c.req.valid("json"),
      userId = c.get("userId");
    const result = await write(teamId, userId, async (client, _account, role) => {
      const file = await client.workspaceFile.findFirst({ where: { id, teamId, trashedAt: null } });
      if (!file) return fileDenial("not_found", "File not found.", 404);
      if (!canManage(file.uploadedById, userId, role))
        return fileDenial(
          "file_owner_only",
          "Only the uploader or workspace owner can change this file.",
          403
        );
      if (change.folder_id !== undefined) {
        const invalid = validDestination(
          await client.workspaceFolder.findMany({ where: { teamId } }),
          change.folder_id
        );
        if (invalid) return invalid;
      }
      const updated = await client.workspaceFile.update({
        where: { id },
        data: { name: change.name, folderId: change.folder_id },
      });
      return { file: fileDto(updated, userId, role) };
    });
    return "error" in result
      ? c.json({ error: result.error, message: result.message }, result.status)
      : c.json(result);
  }
);

for (const action of ["trash", "restore"] as const)
  fileRoutes.post(
    `${base}/files/:id/${action}`,
    validate("param", libraryItemParam),
    access,
    async (c) => {
      const { teamId, id } = c.req.valid("param"),
        userId = c.get("userId");
      const result = await write(teamId, userId, async (client, _account, role) => {
        const file = await client.workspaceFile.findFirst({ where: { id, teamId } });
        if (!file) return fileDenial("not_found", "File not found.", 404);
        if (!canManage(file.uploadedById, userId, role))
          return fileDenial(
            "file_owner_only",
            "Only the uploader or workspace owner can manage this file.",
            403
          );
        if (
          action === "restore" &&
          file.trashedAt &&
          file.trashedAt.getTime() < Date.now() - TRASH_DAYS * 86400_000
        )
          return fileDenial("file_restore_expired", "This file's recovery period has ended.");
        const folders = await client.workspaceFolder.findMany({ where: { teamId } });
        const folderId =
          action === "restore" && validDestination(folders, file.folderId) ? null : file.folderId;
        if ((action === "trash" && file.trashedAt) || (action === "restore" && !file.trashedAt))
          return { ok: true };
        await client.workspaceFile.update({
          where: { id },
          data: {
            folderId,
            trashedAt: action === "trash" ? new Date() : null,
            trashBatchId: action === "trash" ? crypto.randomUUID() : null,
          },
        });
        return { ok: true };
      });
      return "error" in result
        ? c.json({ error: result.error, message: result.message }, result.status)
        : c.json(result);
    }
  );

fileRoutes.delete(`${base}/files/:id`, validate("param", libraryItemParam), access, async (c) => {
  const { teamId, id } = c.req.valid("param"),
    userId = c.get("userId");
  const result = await write(teamId, userId, async (client, account, role) => {
    if (role !== "owner")
      return fileDenial(
        "owner_only",
        "Only the workspace owner can permanently delete files.",
        403
      );
    const file = await client.workspaceFile.findFirst({
      where: { id, teamId, trashedAt: { not: null } },
    });
    if (!file) return fileDenial("not_found", "Trashed file not found.", 404);
    await enqueueFileDeletion(client, account.ownerId, [file]);
    return { ok: true };
  });
  return "error" in result
    ? c.json({ error: result.error, message: result.message }, result.status)
    : c.json(result);
});

for (const action of ["download", "preview"] as const)
  fileRoutes.get(
    `${base}/files/:id/${action}`,
    validate("param", libraryItemParam),
    access,
    async (c) => {
      const { teamId, id } = c.req.valid("param");
      const file = await prisma.workspaceFile.findFirst({ where: { id, teamId, trashedAt: null } });
      if (!file) return c.json({ error: "not_found", message: "File not found." }, 404);
      const range = byteRange(c.req.header("range"), file.sizeBytes);
      if (range === "invalid") {
        c.header("Content-Range", `bytes */${file.sizeBytes}`);
        return c.json({ error: "invalid_input", message: "Invalid byte range." }, 416);
      }
      try {
        const object = await getObjectStream(
          file.storageKey,
          range ? `bytes=${range.start}-${range.end}` : undefined,
          c.req.raw.signal
        );
        c.header("Content-Type", file.contentType);
        c.header("X-Content-Type-Options", "nosniff");
        c.header("Content-Disposition", downloadDisposition(file.name, action === "preview"));
        c.header("Accept-Ranges", "bytes");
        c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
        c.header("X-Frame-Options", "SAMEORIGIN");
        if (range) {
          const expected = `bytes ${range.start}-${range.end}/${file.sizeBytes}`;
          if (object.contentRange !== expected) {
            await object.body.cancel();
            return c.json(
              {
                error: "storage_unavailable",
                message: "File storage did not honor the requested range.",
              },
              503
            );
          }
          c.header("Content-Range", expected);
          c.header("Content-Length", String(range.end - range.start + 1));
        } else c.header("Content-Length", String(file.sizeBytes));
        return c.body(object.body, range ? 206 : 200);
      } catch {
        return c.json(
          { error: "storage_unavailable", message: "File storage is temporarily unavailable." },
          503
        );
      }
    }
  );

fileRoutes.post(
  `${base}/folders`,
  validate("param", libraryTeamParam),
  access,
  validate("json", libraryFolderCreate),
  async (c) => {
    const { teamId } = c.req.valid("param"),
      body = c.req.valid("json"),
      userId = c.get("userId");
    const result = await write(teamId, userId, async (client, _account, role) => {
      const folders = await client.workspaceFolder.findMany({ where: { teamId } });
      const invalid = validDestination(folders, body.parent_id);
      if (invalid) return invalid;
      if (
        folders.length >= MAX_FOLDERS ||
        (folderChain(folders, body.parent_id)?.length ?? 0) >= MAX_FOLDER_DEPTH
      )
        return fileDenial(
          "file_folder_limit",
          "This workspace has reached its folder count or nesting limit."
        );
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true },
      });
      if (!user) return fileDenial("forbidden", "Account unavailable.", 403);
      const folder = await client.workspaceFolder.create({
        data: {
          teamId,
          parentId: body.parent_id,
          name: body.name,
          createdById: userId,
          creatorName: user.displayName || user.username,
        },
      });
      return { folder: folderDto(folder, userId, role) };
    });
    return "error" in result
      ? c.json({ error: result.error, message: result.message }, result.status)
      : c.json(result, 201);
  }
);

fileRoutes.patch(
  `${base}/folders/:id`,
  validate("param", libraryItemParam),
  access,
  validate("json", libraryFolderPatch),
  async (c) => {
    const { teamId, id } = c.req.valid("param"),
      change = c.req.valid("json"),
      userId = c.get("userId");
    const result = await write(teamId, userId, async (client, _account, role) => {
      const folders = await client.workspaceFolder.findMany({ where: { teamId } });
      const folder = folders.find((f) => f.id === id && !f.trashedAt);
      if (!folder) return fileDenial("not_found", "Folder not found.", 404);
      if (!canManage(folder.createdById, userId, role))
        return fileDenial(
          "file_owner_only",
          "Only the creator or workspace owner can change this folder.",
          403
        );
      if (change.parent_id !== undefined) {
        const invalid = validDestination(folders, change.parent_id);
        if (invalid) return invalid;
        const subtree = descendants(folders, id);
        if (change.parent_id && subtree.has(change.parent_id))
          return fileDenial("file_folder_cycle", "A folder cannot be moved inside itself.");
        const parentDepth = folderChain(folders, change.parent_id)?.length ?? 0;
        const oldDepth = folderChain(folders, folder.parentId)?.length ?? 0;
        if (
          [...subtree].some(
            (child) =>
              (folderChain(folders, child)?.length ?? MAX_FOLDER_DEPTH) - oldDepth + parentDepth >
              MAX_FOLDER_DEPTH
          )
        )
          return fileDenial(
            "file_folder_limit",
            "That move would exceed the folder nesting limit."
          );
      }
      const updated = await client.workspaceFolder.update({
        where: { id },
        data: { name: change.name, parentId: change.parent_id },
      });
      return { folder: folderDto(updated, userId, role) };
    });
    return "error" in result
      ? c.json({ error: result.error, message: result.message }, result.status)
      : c.json(result);
  }
);

for (const action of ["trash", "restore"] as const)
  fileRoutes.post(
    `${base}/folders/:id/${action}`,
    validate("param", libraryItemParam),
    access,
    async (c) => {
      const { teamId, id } = c.req.valid("param"),
        userId = c.get("userId");
      const result = await write(teamId, userId, async (client, _account, role) => {
        const folders = await client.workspaceFolder.findMany({ where: { teamId } });
        const folder = folders.find((f) => f.id === id);
        if (!folder) return fileDenial("not_found", "Folder not found.", 404);
        if (!canManage(folder.createdById, userId, role))
          return fileDenial(
            "file_owner_only",
            "Only the creator or workspace owner can manage this folder.",
            403
          );
        if ((action === "trash" && folder.trashedAt) || (action === "restore" && !folder.trashedAt))
          return { ok: true };
        const ids = [...descendants(folders, id)];
        if (action === "trash") {
          if (
            role !== "owner" &&
            (folders.some((f) => ids.includes(f.id) && !canManage(f.createdById, userId, role)) ||
              (await client.workspaceFile.count({
                where: {
                  teamId,
                  folderId: { in: ids },
                  OR: [{ uploadedById: { not: userId } }, { uploadedById: null }],
                },
              })))
          )
            return fileDenial(
              "file_folder_contains_others",
              "This folder contains another member's items. Ask the workspace owner to move it to Trash.",
              403
            );
          const batch = crypto.randomUUID(),
            now = new Date();
          await client.workspaceFile.updateMany({
            where: { teamId, folderId: { in: ids }, trashedAt: null },
            data: { trashedAt: now, trashBatchId: batch },
          });
          await client.workspaceFolder.updateMany({
            where: { teamId, id: { in: ids }, trashedAt: null },
            data: { trashedAt: now, trashBatchId: batch },
          });
        } else {
          if (folder.trashedAt && folder.trashedAt.getTime() < Date.now() - TRASH_DAYS * 86400_000)
            return fileDenial("file_restore_expired", "This folder's recovery period has ended.");
          if (
            role !== "owner" &&
            (folders.some(
              (f) =>
                ids.includes(f.id) &&
                f.trashBatchId === folder.trashBatchId &&
                !canManage(f.createdById, userId, role)
            ) ||
              (await client.workspaceFile.count({
                where: {
                  teamId,
                  folderId: { in: ids },
                  trashBatchId: folder.trashBatchId,
                  OR: [{ uploadedById: { not: userId } }, { uploadedById: null }],
                },
              })))
          )
            return fileDenial(
              "file_folder_contains_others",
              "Ask the workspace owner to restore this folder and its shared contents.",
              403
            );
          // Restore only this deletion batch. Previously trashed children stay in Trash.
          if (validDestination(folders, folder.parentId))
            await client.workspaceFolder.update({ where: { id }, data: { parentId: null } });
          await client.workspaceFile.updateMany({
            where: { teamId, folderId: { in: ids }, trashBatchId: folder.trashBatchId },
            data: { trashedAt: null, trashBatchId: null },
          });
          await client.workspaceFolder.updateMany({
            where: { teamId, id: { in: ids }, trashBatchId: folder.trashBatchId },
            data: { trashedAt: null, trashBatchId: null },
          });
        }
        return { ok: true };
      });
      return "error" in result
        ? c.json({ error: result.error, message: result.message }, result.status)
        : c.json(result);
    }
  );

fileRoutes.delete(`${base}/folders/:id`, validate("param", libraryItemParam), access, async (c) => {
  const { teamId, id } = c.req.valid("param"),
    userId = c.get("userId");
  const result = await write(teamId, userId, async (client, account, role) => {
    if (role !== "owner")
      return fileDenial(
        "owner_only",
        "Only the workspace owner can permanently delete folders.",
        403
      );
    const folders = await client.workspaceFolder.findMany({ where: { teamId } });
    const folder = folders.find((f) => f.id === id && f.trashedAt);
    if (!folder) return fileDenial("not_found", "Trashed folder not found.", 404);
    const ids = [...descendants(folders, id)];
    await enqueueFileDeletion(
      client,
      account.ownerId,
      await client.workspaceFile.findMany({ where: { teamId, folderId: { in: ids } } })
    );
    await client.workspaceFolder.deleteMany({ where: { teamId, id: { in: ids } } });
    return { ok: true };
  });
  return "error" in result
    ? c.json({ error: result.error, message: result.message }, result.status)
    : c.json(result);
});
