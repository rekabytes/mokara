import { prisma } from "../db.ts";
import { deleteObjectStrict, storageReady } from "./storage.ts";
import { log } from "./logger.ts";
import { withStorageAccount } from "./quota.ts";
import { descendants, TRASH_DAYS } from "./workspace-files.ts";
import type { Prisma, WorkspaceFile } from "@mokara/db/prisma/generated/client";

/** Transfer bytes into durable cleanup accounting before removing visible metadata. */
export async function enqueueFileDeletion(
  client: Prisma.TransactionClient,
  ownerId: string,
  files: WorkspaceFile[]
) {
  if (!files.length) return;
  await client.fileObjectDeletion.createMany({
    data: files.map((file) => ({
      ownerId,
      teamId: file.teamId,
      storageKey: file.storageKey,
      sizeBytes: file.sizeBytes,
    })),
    skipDuplicates: true,
  });
  await client.workspaceFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
}

export async function expireFileTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86400_000);
  const folders = await prisma.workspaceFolder.findMany({
    where: { trashedAt: { lte: cutoff } },
    orderBy: { trashedAt: "asc" },
    take: 25,
  });
  for (const folder of folders)
    await withStorageAccount(folder.teamId, async (client, account) => {
      const current = await client.workspaceFolder.findUnique({ where: { id: folder.id } });
      if (!current?.trashedAt || current.trashedAt > cutoff) return;
      const tree = await client.workspaceFolder.findMany({ where: { teamId: folder.teamId } });
      const ids = [...descendants(tree, folder.id)];
      const files = await client.workspaceFile.findMany({
        where: { teamId: folder.teamId, folderId: { in: ids } },
      });
      await enqueueFileDeletion(client, account.ownerId, files);
      await client.workspaceFolder.deleteMany({
        where: { id: { in: ids }, teamId: folder.teamId },
      });
    });
  const expired = await prisma.workspaceFile.findMany({
    where: { trashedAt: { lte: cutoff } },
    take: 25,
  });
  for (const file of expired)
    await withStorageAccount(file.teamId, async (client, account) => {
      const current = await client.workspaceFile.findUnique({ where: { id: file.id } });
      if (current?.trashedAt && current.trashedAt <= cutoff)
        await enqueueFileDeletion(client, account.ownerId, [current]);
    });
}

export async function drainFileDeletions(signal?: AbortSignal) {
  if (!storageReady()) return;
  const jobs = await prisma.fileObjectDeletion.findMany({
    where: { nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 25,
  });
  for (const job of jobs) {
    if (signal?.aborted) return;
    // The owner lock also guards upload reservation → live-file conversion.
    const claimed = await prisma.$transaction(
      async (client) => {
        await client.$queryRaw`SELECT id FROM users WHERE id = ${job.ownerId}::uuid FOR UPDATE`;
        return client.fileObjectDeletion.updateMany({
          where: { id: job.id, nextAttemptAt: { lte: new Date() } },
          data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
        });
      },
      { isolationLevel: "ReadCommitted" }
    );
    if (!claimed.count) continue;
    try {
      const timeout = AbortSignal.timeout(15_000);
      await deleteObjectStrict(
        job.storageKey,
        signal ? AbortSignal.any([signal, timeout]) : timeout
      );
      await prisma.fileObjectDeletion.deleteMany({ where: { id: job.id } });
    } catch {
      // Retain both the retry job and its charged bytes; never report reclaimed storage.
      if (!signal?.aborted) log.warn(`File deletion ${job.id} will retry`);
    }
  }
}

export function startFileCleanupWorker(): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let running = Promise.resolve();
  let lastExpiry = 0;
  const tick = async () => {
    try {
      if (Date.now() - lastExpiry > 60_000) {
        await expireFileTrash();
        lastExpiry = Date.now();
      }
      await drainFileDeletions(controller.signal);
    } catch {
      if (!stopped) log.warn("File cleanup is temporarily unavailable");
    }
    if (!stopped) {
      timer = setTimeout(() => {
        running = tick();
      }, 5000);
      timer.unref();
    }
  };
  if (storageReady()) running = tick();
  return async () => {
    stopped = true;
    controller.abort();
    if (timer) clearTimeout(timer);
    await running;
  };
}
