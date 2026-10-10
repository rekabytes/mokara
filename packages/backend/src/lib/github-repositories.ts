import { prisma } from "../db.ts";
import { GITHUB_REPOSITORY_LIMIT } from "./plans.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";

export const GITHUB_USER_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function repositorySelectionError(ids: string[]): string | null {
  if (new Set(ids).size !== ids.length) return "invalid_input";
  return ids.length > GITHUB_REPOSITORY_LIMIT ? "github_repository_limit" : null;
}

export async function activateGitHubRepositories(userId: string, ids: string[]) {
  const selectionError = repositorySelectionError(ids);
  if (selectionError) return selectionError;
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize refresh/selection/disconnect for this user's connection.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const connection = await tx.gitHubAccountConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== "active") return "github_connection_required";
    if (Date.now() - connection.verifiedAt.getTime() > GITHUB_USER_VERIFICATION_TTL_MS)
      return "github_reauthorization_required";
    const accessible = await tx.gitHubAccountRepository.count({
      where: {
        connectionId: connection.id,
        repositoryId: { in: ids },
        repository: {
          active: true,
          installation: {
            status: "active",
            connections: { some: { connectionId: connection.id } },
          },
        },
      },
    });
    if (accessible !== ids.length) return "github_repository_forbidden";
    await tx.gitHubAccountRepository.updateMany({
      where: { connectionId: connection.id },
      data: { enabled: false },
    });
    await tx.gitHubAccountRepository.updateMany({
      where: { connectionId: connection.id, repositoryId: { in: ids } },
      data: { enabled: true },
    });
    // Historical links remain, but disabled repositories stop participating.
    await tx.gitHubIssueLink.updateMany({
      where: { connectionId: connection.id, repositoryId: { notIn: ids }, status: "linked" },
      data: { syncStatus: "paused", syncErrorCode: "github_repository_inactive" },
    });
    return null;
  });
}
