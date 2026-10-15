import { randomUUID } from "node:crypto";
import type { Prisma } from "@mokara/db/prisma/generated/client";
import { prisma } from "../db.ts";
import { githubConfigured } from "../env.ts";
import {
  GitHubError,
  getGitHubUser,
  listUserInstallations,
  listUserInstallationRepositories,
  refreshGitHubUserToken,
  type GitHubInstallationInfo,
  type GitHubRepositoryInfo,
} from "./github.ts";
import { encryptGitHubCredentials, decryptGitHubCredentials } from "./github-credentials.ts";

export const GITHUB_ACCESS_CHECK_MS = 5 * 60_000;
const LEGACY_VERIFICATION_MS = 24 * 60 * 60_000;
const LEASE_MS = 2 * 60_000;
const pending = new Map<string, Promise<void>>();

export async function readGitHubIdentity(token: string) {
  const [user, installations] = await Promise.all([
    getGitHubUser(token),
    listUserInstallations(token),
  ]);
  const verifiedInstallations = await Promise.all(
    installations.map(async (info) => ({
      info,
      repositories: await listUserInstallationRepositories(token, info.id),
    }))
  );
  return { user, installations: verifiedInstallations };
}
export type GitHubIdentity = Awaited<ReturnType<typeof readGitHubIdentity>>;

async function persistInstallation(
  client: Prisma.TransactionClient,
  connectionId: string,
  info: GitHubInstallationInfo,
  repositories: GitHubRepositoryInfo[]
) {
  const now = new Date();
  const installation = await client.gitHubInstallation.upsert({
    where: { githubInstallationId: info.id },
    create: {
      githubInstallationId: info.id,
      accountId: info.accountId,
      accountLogin: info.accountLogin,
      accountType: info.accountType,
      status: "active",
      lastVerifiedAt: now,
    },
    update: {
      accountId: info.accountId,
      accountLogin: info.accountLogin,
      accountType: info.accountType,
      status: "active",
      lastVerifiedAt: now,
    },
  });
  await client.gitHubAccountInstallation.upsert({
    where: {
      connectionId_installationId: { connectionId, installationId: installation.id },
    },
    create: { connectionId, installationId: installation.id, verifiedAt: now },
    update: { verifiedAt: now },
  });
  for (const repository of repositories) {
    const row = await client.gitHubRepository.upsert({
      where: { githubRepositoryId: repository.id },
      create: {
        installationId: installation.id,
        githubRepositoryId: repository.id,
        ownerLogin: repository.ownerLogin,
        name: repository.name,
        fullName: repository.fullName,
        private: repository.private,
        active: true,
        lastVerifiedAt: now,
      },
      update: {
        installationId: installation.id,
        ownerLogin: repository.ownerLogin,
        name: repository.name,
        fullName: repository.fullName,
        private: repository.private,
        active: true,
        lastVerifiedAt: now,
      },
    });
    await client.gitHubAccountRepository.upsert({
      where: { connectionId_repositoryId: { connectionId, repositoryId: row.id } },
      create: { connectionId, repositoryId: row.id, verifiedAt: now },
      update: { verifiedAt: now },
    });
  }
}

export async function persistGitHubAccess(
  tx: Prisma.TransactionClient,
  connectionId: string,
  identity: GitHubIdentity,
  clearSelections = false
) {
  const verifiedIds = identity.installations.map((row) => row.info.id);
  await tx.gitHubAccountInstallation.deleteMany({
    where: {
      connectionId,
      ...(verifiedIds.length
        ? { installation: { githubInstallationId: { notIn: verifiedIds } } }
        : {}),
    },
  });
  const visibleIds = identity.installations.flatMap((row) =>
    row.repositories.map((repo) => repo.id)
  );
  await tx.gitHubAccountRepository.deleteMany({
    where: {
      connectionId,
      ...(clearSelections ? {} : { repository: { githubRepositoryId: { notIn: visibleIds } } }),
    },
  });
  for (const installation of identity.installations)
    await persistInstallation(tx, connectionId, installation.info, installation.repositories);
  await tx.gitHubIssueLink.updateMany({
    where: {
      connectionId,
      status: "linked",
      repository: { connections: { none: { connectionId, enabled: true } } },
    },
    data: {
      syncStatus: "paused",
      syncErrorCode: "github_repository_inactive",
      syncRevision: { increment: 1 },
    },
  });
}

export async function ensureGitHubAccess(userId: string, force = false): Promise<void> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const action = verifyAccess(userId, force);
  pending.set(userId, action);
  try {
    await action;
  } finally {
    if (pending.get(userId) === action) pending.delete(userId);
  }
}

async function verifyAccess(userId: string, force: boolean): Promise<void> {
  const connection = await prisma.gitHubAccountConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "active")
    throw new GitHubError(409, "github_connection_required", "Connect GitHub first");
  if (!connection.credentialsEncrypted) {
    if (force || Date.now() - connection.verifiedAt.getTime() > LEGACY_VERIFICATION_MS)
      throw new GitHubError(
        409,
        "github_reauthorization_required",
        "Reconnect GitHub once to enable renewal"
      );
    return;
  }
  if (!force && Date.now() - connection.verifiedAt.getTime() < GITHUB_ACCESS_CHECK_MS) return;
  if (
    !force &&
    connection.verificationRetryAt &&
    connection.verificationRetryAt.getTime() > Date.now()
  )
    throw new GitHubError(
      503,
      "github_verification_pending",
      "GitHub verification will retry shortly"
    );
  const leaseId = randomUUID();
  const owned = { id: connection.id, status: "active", refreshLeaseId: leaseId };
  const acquired = await prisma.gitHubAccountConnection.updateMany({
    where: {
      id: connection.id,
      status: "active",
      credentialsEncrypted: connection.credentialsEncrypted,
      OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lte: new Date() } }],
    },
    data: { refreshLeaseId: leaseId, refreshLeaseUntil: new Date(Date.now() + LEASE_MS) },
  });
  if (!acquired.count)
    throw new GitHubError(
      503,
      "github_verification_pending",
      "GitHub access verification is in progress"
    );
  let lostLease = false;
  const heartbeat = setInterval(() => {
    void prisma.gitHubAccountConnection
      .updateMany({ where: owned, data: { refreshLeaseUntil: new Date(Date.now() + LEASE_MS) } })
      .then(
        (result) => {
          if (!result.count) lostLease = true;
        },
        () => {
          lostLease = true;
        }
      );
  }, LEASE_MS / 3);
  heartbeat.unref();
  try {
    // Revalidate lease ownership immediately before any one-use token exchange.
    const renewed = await prisma.gitHubAccountConnection.updateMany({
      where: { ...owned, refreshLeaseUntil: { gt: new Date() } },
      data: { refreshLeaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (!renewed.count)
      throw new GitHubError(
        503,
        "github_verification_pending",
        "GitHub verification was superseded"
      );
    let credentials = decryptGitHubCredentials(userId, connection.credentialsEncrypted);
    if (credentials.expiresAt !== null && credentials.expiresAt <= Date.now() + 60_000) {
      if (
        !credentials.refreshToken ||
        (credentials.refreshExpiresAt !== null && credentials.refreshExpiresAt <= Date.now())
      )
        throw new GitHubError(
          409,
          "github_reauthorization_required",
          "GitHub authorization expired"
        );
      credentials = await refreshGitHubUserToken(credentials.refreshToken);
      // Refresh tokens rotate once: persist the replacement before any repository reads.
      const saved = await prisma.gitHubAccountConnection.updateMany({
        where: owned,
        data: { credentialsEncrypted: encryptGitHubCredentials(userId, credentials) },
      });
      if (!saved.count || lostLease)
        throw new GitHubError(
          503,
          "github_verification_pending",
          "GitHub verification was superseded"
        );
    }
    const identity = await readGitHubIdentity(credentials.accessToken);
    if (identity.user.id !== connection.githubUserId)
      throw new GitHubError(409, "github_reauthorization_required", "GitHub identity changed");
    if (lostLease)
      throw new GitHubError(
        503,
        "github_verification_pending",
        "GitHub verification was superseded"
      );
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const current = await tx.gitHubAccountConnection.findUnique({ where: { userId } });
        if (!current || current.refreshLeaseId !== leaseId || current.status !== "active")
          throw new GitHubError(
            503,
            "github_verification_pending",
            "GitHub verification was superseded"
          );
        await persistGitHubAccess(tx, connection.id, identity);
        await tx.gitHubAccountConnection.updateMany({
          where: owned,
          data: {
            githubLogin: identity.user.login,
            verifiedAt: new Date(),
            verificationRetryAt: null,
            refreshLeaseId: null,
            refreshLeaseUntil: null,
          },
        });
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    if (
      error instanceof GitHubError &&
      (error.status === 401 || error.code === "github_reauthorization_required")
    ) {
      const invalidated = await prisma.gitHubAccountConnection.updateMany({
        where: owned,
        data: {
          status: "revoked",
          credentialsEncrypted: null,
          refreshLeaseId: null,
          refreshLeaseUntil: null,
        },
      });
      if (!invalidated.count)
        throw new GitHubError(
          503,
          "github_verification_pending",
          "GitHub verification was superseded"
        );
      throw new GitHubError(
        409,
        "github_reauthorization_required",
        "Reconnect GitHub to restore authorization"
      );
    }
    await prisma.gitHubAccountConnection.updateMany({
      where: owned,
      data: { verificationRetryAt: new Date(Date.now() + 60_000) },
    });
    if (error instanceof GitHubError)
      throw new GitHubError(
        error.status,
        error.code,
        "GitHub access verification is temporarily unavailable"
      );
    throw error;
  } finally {
    clearInterval(heartbeat);
    await prisma.gitHubAccountConnection.updateMany({
      where: owned,
      data: { refreshLeaseId: null, refreshLeaseUntil: null },
    });
  }
}

export async function refreshDueGitHubConnections(limit = 3): Promise<void> {
  if (!githubConfigured) return;
  const due = await prisma.gitHubAccountConnection.findMany({
    where: {
      status: "active",
      credentialsEncrypted: { not: null },
      verifiedAt: { lte: new Date(Date.now() - GITHUB_ACCESS_CHECK_MS) },
      AND: [
        { OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lte: new Date() } }] },
        { OR: [{ verificationRetryAt: null }, { verificationRetryAt: { lte: new Date() } }] },
      ],
    },
    orderBy: { verifiedAt: "asc" },
    take: limit,
    select: { userId: true },
  });
  for (const row of due) {
    try {
      await ensureGitHubAccess(row.userId);
    } catch (error) {
      // A single account failure must not block other connections or the sync queue.
      if (!(error instanceof GitHubError)) throw error;
    }
  }
}
