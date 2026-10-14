import { prisma } from "../db.ts";
import { isHosted } from "../env.ts";
import { effectivePlan, limitsFor, UNLIMITED, type PlanLimits } from "./plans.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";

type Client = Prisma.TransactionClient;
export type StorageAccount = { ownerId: string; limits: PlanLimits };
export type StorageDenial = { status: 404 | 400 | 409; error: string; message: string };

/** Workspace usage is still useful for support; it is not a separate allowance. */
export async function usedBytes(teamId: string): Promise<number> {
  const [files, team, library, pending] = await Promise.all([
    prisma.attachment.aggregate({ where: { teamId }, _sum: { sizeBytes: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { logoBytes: true } }),
    prisma.workspaceFile.aggregate({ where: { teamId }, _sum: { sizeBytes: true } }),
    prisma.fileObjectDeletion.aggregate({ where: { teamId }, _sum: { sizeBytes: true } }),
  ]);
  return (
    (files._sum.sizeBytes ?? 0) +
    (team?.logoBytes ?? 0) +
    (library._sum.sizeBytes ?? 0) +
    (pending._sum.sizeBytes ?? 0)
  );
}

/** All uploads and logos in the owner's personal AND team workspaces share one pool.
 * Membership and uploader identity never move bytes to another account. */
export async function usedBytesOfOwner(ownerId: string, client: Client = prisma): Promise<number> {
  const [files, logos, library, pending] = await Promise.all([
    client.attachment.aggregate({ where: { team: { ownerId } }, _sum: { sizeBytes: true } }),
    client.team.aggregate({ where: { ownerId }, _sum: { logoBytes: true } }),
    client.workspaceFile.aggregate({ where: { team: { ownerId } }, _sum: { sizeBytes: true } }),
    client.fileObjectDeletion.aggregate({ where: { ownerId }, _sum: { sizeBytes: true } }),
  ]);
  return (
    (files._sum.sizeBytes ?? 0) +
    (logos._sum.logoBytes ?? 0) +
    (library._sum.sizeBytes ?? 0) +
    (pending._sum.sizeBytes ?? 0)
  );
}

export async function storageAccountForTeam(
  teamId: string,
  client: Client = prisma
): Promise<StorageAccount | null> {
  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { ownerId: true, owner: { select: { plan: true, planOverride: true } } },
  });
  if (!team) return null;
  return {
    ownerId: team.ownerId,
    limits: isHosted ? limitsFor(effectivePlan(team.owner)) : UNLIMITED,
  };
}

export async function storageUploadDenial(
  account: StorageAccount,
  size: number,
  replacedBytes = 0,
  client: Client = prisma
): Promise<StorageDenial | null> {
  if (size > account.limits.maxFileBytes) {
    return {
      status: 400,
      error: "file_too_large",
      message: `That file is too large — ${Math.floor(account.limits.maxFileBytes / 1024 ** 2)} MB maximum per file on this plan.`,
    };
  }
  if (!Number.isFinite(account.limits.storageBytes)) return null;
  const used = await usedBytesOfOwner(account.ownerId, client);
  if (used - replacedBytes + size > account.limits.storageBytes) {
    return {
      status: 409,
      error: "quota_exceeded",
      message: `The workspace owner's account has reached its ${Math.floor(account.limits.storageBytes / 1024 ** 3)} GB storage limit, shared across all owned workspaces.`,
    };
  }
  return null;
}

/** Serialize final quota checks and metadata writes across every workspace owned
 * by this account. Object-store I/O stays outside this short transaction.
 * READ COMMITTED observes the previous upload after acquiring the owner lock. */
export async function withStorageAccount<T>(
  teamId: string,
  operation: (client: Client, account: StorageAccount) => Promise<T>
): Promise<T | StorageDenial> {
  return prisma.$transaction(
    async (client) => {
      const before = await storageAccountForTeam(teamId, client);
      if (!before) return { status: 404, error: "not_found", message: "Team not found." };
      await client.$queryRaw`SELECT id FROM users WHERE id = ${before.ownerId}::uuid FOR UPDATE`;
      // Reload after waiting: plan updates also lock this user row.
      const account = await storageAccountForTeam(teamId, client);
      if (!account) return { status: 404, error: "not_found", message: "Team not found." };
      return operation(client, account);
    },
    { isolationLevel: "ReadCommitted" }
  );
}
