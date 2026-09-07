import { Hono } from "hono";
import { prisma } from "../db.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { limitsOfTeam } from "../lib/entitlements.ts";
import { usedBytes } from "../lib/quota.ts";
import {
  deleteObject,
  getObjectBytes,
  putObject,
  storageKey,
  storageReady,
} from "../lib/storage.ts";
import { toAttachment } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-11 Phase 1.3: files on a task, metered against the workspace's storage
// quota — and since comment attachments (owner, 2026-09-05), files on comments
// too. Same nesting idiom as comments.ts: list/upload hang off the owner
// (task or comment), download/delete off the file itself.
//
// Deletion is the UPLOADER's alone (owner decision 2026-09-05, superseding the
// earlier "uploader or leader" rule): whoever put the file there owns its
// removal. The quota consequence — a leader cannot clear someone else's stray
// upload — is accepted; the per-workspace cap still bounds total exposure.
//
// BOTH surfaces accept IMAGES AND PDFS ONLY (owner decision 2026-09-05, which
// also retired the earlier any-type task files): the content type is checked
// here, and the UI only ever uploads at creation time.
export const attachmentRoutes = new Hono<{ Variables: Vars }>();

const uploaderInclude = {
  uploader: { select: { id: true, username: true, displayName: true } },
} as const;

const MAX_FILENAME = 200;

/** Comment attachments are an allowlist, not a free-for-all. */
function commentFileTypeOk(type: string): boolean {
  return type.startsWith("image/") || type === "application/pdf";
}

// The stored name is display text, not a path: the object key is server-minted
// from the row id, so none of this reaches the bucket. Stripping directory
// parts and control characters is about what other users READ in the drawer.
function safeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_FILENAME);
  return clean === "" ? "file" : clean;
}

// `attachment; filename="…"` for legacy clients plus the RFC 5987 form, which
// is the one that survives unicode names.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function taskTeam(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { teamId: true } });
  return task?.teamId ?? null;
}

// A comment's container, reached through its task. Null means "no such comment".
async function commentTaskId(commentId: string): Promise<string | null> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { taskId: true },
  });
  return comment?.taskId ?? null;
}

type Denial = { status: 404 | 403 | 409 | 400 | 503; error: string; message: string };

/**
 * The whole upload pipeline the task and comment routes share: storage
 * configured? → file present? → plan caps → quota → put → row. `scope` and
 * `scopeId` shape the storage key; everything else is identical on purpose.
 * Returns the created row's response, or the denial to answer with.
 */
async function storeUpload(
  c: {
    get: (k: "userId") => string;
    req: { parseBody: () => Promise<Record<string, string | File>> };
  },
  input: { teamId: string; scope: "tasks" | "comments"; scopeId: string; allowlist?: boolean }
): Promise<{ attachment: ReturnType<typeof toAttachment> } | Denial> {
  const userId = c.get("userId");

  // No bucket configured (the self-hosted default) is a feature statement, not
  // an outage: everything else on this instance keeps working.
  if (!storageReady()) {
    return {
      status: 409,
      error: "attachments_disabled",
      message: "this instance has no file storage configured",
    };
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return { status: 400, error: "invalid_input", message: "a file is required" };
  }

  const limits = await limitsOfTeam(input.teamId);
  if (!limits) return { status: 404, error: "not_found", message: "team not found" };

  const contentType = file.type || "application/octet-stream";
  if (input.allowlist && !commentFileTypeOk(contentType)) {
    return {
      status: 400,
      error: "unsupported_type",
      message: "comments accept images and PDFs only",
    };
  }

  // Size comes from the bytes we actually received — never from a header or a
  // client claim, which is what makes the quota enforceable.
  if (file.size > limits.maxFileBytes) {
    return {
      status: 400,
      error: "file_too_large",
      message: `that file is too large — ${Math.floor(limits.maxFileBytes / (1024 * 1024))} MB maximum per file on this plan`,
    };
  }
  const used = await usedBytes(input.teamId);
  if (used + file.size > limits.storageBytes) {
    return {
      status: 409,
      error: "quota_exceeded",
      message: `this workspace is out of storage — its plan allows ${Math.floor(limits.storageBytes / (1024 * 1024 * 1024))} GB`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = crypto.randomUUID();
  const key = storageKey({
    teamId: input.teamId,
    scope: input.scope,
    scopeId: input.scopeId,
    attachmentId: id,
  });

  // Object first, row second: if the put fails the user gets an honest error
  // and nothing is listed; if the row insert fails afterwards we leak an
  // unreferenced object, which is a billing nuisance rather than a lying row.
  try {
    await putObject({ key, body: bytes, contentType });
  } catch {
    return {
      status: 503,
      error: "storage_unavailable",
      message: "file storage could not be reached — try again",
    };
  }

  try {
    const row = await prisma.attachment.create({
      data: {
        id,
        taskId: input.scope === "tasks" ? input.scopeId : null,
        commentId: input.scope === "comments" ? input.scopeId : null,
        teamId: input.teamId,
        uploaderId: userId,
        filename: safeFilename(file.name),
        sizeBytes: file.size,
        contentType,
        storageKey: key,
      },
      include: uploaderInclude,
    });
    return { attachment: toAttachment(row) };
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

/** Best-effort removal of stored objects, after their rows are already gone. */
export async function purgeAttachmentObjects(keys: string[]): Promise<void> {
  for (const key of keys) await deleteObject(key);
}

// GET /tasks/:id/attachments — the task drawer's Files list.
attachmentRoutes.get("/tasks/:id/attachments", async (c) => {
  const taskId = c.req.param("id")!;
  const teamId = await taskTeam(taskId);
  if (!teamId) return c.json({ error: "not_found", message: "task not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const files = await prisma.attachment.findMany({
    where: { taskId },
    include: uploaderInclude,
    orderBy: { createdAt: "asc" },
  });
  return c.json({ attachments: files.map(toAttachment) });
});

// POST /tasks/:id/attachments — creation-time files (the New task modal is
// the only UI that calls this now).
attachmentRoutes.post("/tasks/:id/attachments", async (c) => {
  const taskId = c.req.param("id")!;
  const teamId = await taskTeam(taskId);
  if (!teamId) return c.json({ error: "not_found", message: "task not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const result = await storeUpload(c, {
    teamId,
    scope: "tasks",
    scopeId: taskId,
    allowlist: true,
  });
  if ("error" in result)
    return c.json({ error: result.error, message: result.message }, result.status);
  return c.json(result, 201);
});

// Comment attachments (owner, 2026-09-05): any member may attach to any
// comment they can see — replies included — with an image/PDF allowlist.
// Body still accompanies the file: the composer keeps its text rule.
attachmentRoutes.get("/comments/:id/attachments", async (c) => {
  const commentId = c.req.param("id")!;
  const taskId = await commentTaskId(commentId);
  if (!taskId) return c.json({ error: "not_found", message: "comment not found" }, 404);
  const teamId = await taskTeam(taskId);
  if (!teamId) return c.json({ error: "not_found", message: "task not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const files = await prisma.attachment.findMany({
    where: { commentId },
    include: uploaderInclude,
    orderBy: { createdAt: "asc" },
  });
  return c.json({ attachments: files.map(toAttachment) });
});

attachmentRoutes.post("/comments/:id/attachments", async (c) => {
  const commentId = c.req.param("id")!;
  const taskId = await commentTaskId(commentId);
  if (!taskId) return c.json({ error: "not_found", message: "comment not found" }, 404);
  const teamId = await taskTeam(taskId);
  if (!teamId) return c.json({ error: "not_found", message: "task not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  const result = await storeUpload(c, {
    teamId,
    scope: "comments",
    scopeId: commentId,
    allowlist: true,
  });
  if ("error" in result)
    return c.json({ error: result.error, message: result.message }, result.status);
  return c.json(result, 201);
});

// Downloads always stream through the backend: a navigation is outside the CSP,
// and `attachment` disposition is a security choice, not a preference — it
// forces a download, so an uploaded HTML or SVG file can never render with our
// origin's cookies.
attachmentRoutes.get("/attachments/:id/download", async (c) => {
  const id = c.req.param("id")!;
  if (!storageReady()) {
    return c.json(
      { error: "attachments_disabled", message: "file storage is not configured" },
      409
    );
  }

  const file = await prisma.attachment.findUnique({ where: { id } });
  if (!file) return c.json({ error: "not_found", message: "attachment not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), file.teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  let body: { body: Uint8Array<ArrayBuffer>; contentType: string };
  try {
    body = await getObjectBytes(file.storageKey);
  } catch {
    return c.json(
      { error: "storage_unavailable", message: "file storage could not be reached — try again" },
      503
    );
  }

  return c.body(body.body, 200, {
    "Content-Type": file.contentType || body.contentType,
    "Content-Length": String(body.body.byteLength),
    "Content-Disposition": contentDisposition(file.filename),
    "Cache-Control": "private, no-store",
  });
});

attachmentRoutes.delete("/attachments/:id", async (c) => {
  const id = c.req.param("id")!;
  const userId = c.get("userId");

  const file = await prisma.attachment.findUnique({ where: { id } });
  if (!file) return c.json({ error: "not_found", message: "attachment not found" }, 404);

  // Membership gates *access*; the file itself answers only to its uploader.
  if (!(await getTeamRole(userId, file.teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }
  if (file.uploaderId !== userId) {
    return c.json({ error: "forbidden", message: "only the uploader can remove this file" }, 403);
  }

  await prisma.attachment.delete({ where: { id } });
  await deleteObject(file.storageKey);
  return c.body(null, 204);
});
