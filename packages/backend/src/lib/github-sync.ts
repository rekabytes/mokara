import type { Prisma } from "@mokara/db/prisma/generated/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.ts";
import { githubConfigured } from "../env.ts";
import {
  GitHubError,
  getGitHubIssue,
  setGitHubIssueState,
  getGitHubPullRequest,
  githubBranchExists,
} from "./github.ts";
import {
  branchIssueNumber,
  desiredGitHubState,
  githubTaskStatus,
  githubInboundSchema,
  type GitHubInboundEvent,
} from "./github-sync-rules.ts";
import { GITHUB_USER_VERIFICATION_TTL_MS } from "./github-repositories.ts";
import { TASK_INCLUDE, taskResponse } from "./task-response.ts";
import { publishToTeam } from "./events.ts";
import { regenerateDueSoonForTeam } from "./notifications.ts";
import { log } from "./logger.ts";

const POLL_MS = 2000;
const LEASE_MS = 5 * 60_000;
const taskPayload = z.object({ taskId: z.uuid() });
const LINK_INCLUDE = {
  task: true,
  connection: true,
  repository: { include: { installation: true } },
} as const;
type LinkedTask = Prisma.GitHubIssueLinkGetPayload<{ include: typeof LINK_INCLUDE }>;
type IssueEvent = Extract<GitHubInboundEvent, { event: "issues" }>;
type DevelopmentEvent = {
  action: "closed" | "reopened" | "opened" | "branch";
  actor: string;
  updatedAt: Date;
  pullRequestId?: bigint;
  ref?: string;
};

/** Save local status and its durable outbox in the same task transaction. */
export async function enqueueGitHubTaskSync(
  tx: Prisma.TransactionClient,
  taskId: string,
  localChange = true
): Promise<void> {
  if (!githubConfigured) return;
  const link = await tx.gitHubIssueLink.findUnique({ where: { taskId } });
  if (!link || link.status !== "linked") return;
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task) return;
  await tx.gitHubIssueLink.update({
    where: { id: link.id },
    data: {
      syncStatus: "pending",
      syncErrorCode: null,
      desiredState: desiredGitHubState(task.status),
      syncRevision: { increment: 1 },
      // GitHub timestamps have second precision; compare like with like.
      ...(localChange ? { localStatusAt: new Date(Math.floor(Date.now() / 1000) * 1000) } : {}),
    },
  });
  await tx.gitHubSyncJob.create({ data: { kind: "task", payload: { taskId } } });
}

export async function resumeGitHubSync(userId: string): Promise<void> {
  const connection = await prisma.gitHubAccountConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "active") return;
  // Restore only this publisher's historical links, after explicit activation.
  await prisma.gitHubIssueLink.updateMany({
    where: {
      createdByUserId: userId,
      connectionId: null,
      status: "linked",
      repository: {
        active: true,
        installation: { status: "active" },
        connections: { some: { connectionId: connection.id, enabled: true } },
      },
    },
    data: { connectionId: connection.id, syncRevision: { increment: 1 } },
  });
  const links = await prisma.gitHubIssueLink.findMany({
    where: {
      status: "linked",
      syncStatus: { in: ["paused", "failed"] },
      connection: { userId, status: "active" },
      repository: {
        active: true,
        installation: { status: "active" },
        connections: { some: { enabled: true, connection: { userId } } },
      },
    },
    select: { taskId: true },
  });
  for (const link of links)
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${link.taskId}::uuid FOR UPDATE`;
      await enqueueGitHubTaskSync(tx, link.taskId, false);
    });
}

async function emitTask(taskId: string, statusChanged = false): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
  if (!task) return;
  await publishToTeam(task.teamId, { event: "task_updated", data: taskResponse(task) }).catch(
    (error) => log.error("GitHub task update not published", error)
  );
  if (statusChanged) await regenerateDueSoonForTeam(task.teamId);
}

async function pauseReason(
  client: Prisma.TransactionClient,
  link: LinkedTask
): Promise<string | null> {
  const connection = link.connection;
  if (!connection || connection.status !== "active") return "github_connection_required";
  if (Date.now() - connection.verifiedAt.getTime() > GITHUB_USER_VERIFICATION_TTL_MS)
    return "github_reauthorization_required";
  if (!link.repository.active || link.repository.installation.status !== "active")
    return "github_repository_unavailable";
  const installation = await client.gitHubAccountInstallation.findUnique({
    where: {
      connectionId_installationId: {
        connectionId: connection.id,
        installationId: link.repository.installationId,
      },
    },
  });
  if (!installation) return "github_repository_forbidden";
  const access = await client.gitHubAccountRepository.findUnique({
    where: {
      connectionId_repositoryId: { connectionId: connection.id, repositoryId: link.repositoryId },
    },
  });
  if (!access?.enabled) return "github_repository_inactive";
  if (
    !(await client.teamMember.findUnique({
      where: { teamId_userId: { teamId: link.task.teamId, userId: connection.userId } },
    }))
  )
    return "github_workspace_access_revoked";
  return null;
}

// Never keep a task transaction/row lock open over GitHub requests. Revisions
// reject stale results; a raced external write queues a corrective latest-state
// outbox. Local task edits stay usable during a slow/unavailable GitHub request.
async function syncLink(linkId: string, event?: IssueEvent | DevelopmentEvent): Promise<void> {
  const snapshot = await prisma.gitHubIssueLink.findUnique({
    where: { id: linkId },
    include: LINK_INCLUDE,
  });
  if (
    !snapshot ||
    snapshot.status !== "linked" ||
    snapshot.issueNumber === null ||
    snapshot.githubIssueId === null
  )
    return;
  let statusChanged = false;
  try {
    const paused = await pauseReason(prisma, snapshot);
    if (paused) {
      await prisma.gitHubIssueLink.updateMany({
        where: { id: linkId, syncRevision: snapshot.syncRevision },
        data: { syncStatus: "paused", syncErrorCode: paused },
      });
      await emitTask(snapshot.taskId);
      return;
    }
    const repository = {
      installationId: snapshot.repository.installation.githubInstallationId,
      repositoryId: snapshot.repository.githubRepositoryId,
      owner: snapshot.repository.ownerLogin,
      name: snapshot.repository.name,
    };
    let remote = await getGitHubIssue(repository, snapshot.issueNumber);
    if (remote.id !== snapshot.githubIssueId)
      throw new GitHubError(409, "github_issue_mismatch", "Linked issue identity changed");
    if (
      event &&
      !("event" in event) &&
      event.ref &&
      !(await githubBranchExists(repository, event.ref))
    )
      return;
    let wroteRemote = false;
    if (!event) {
      // Recheck before the write; a later concurrent edit is repaired below.
      const latest = await prisma.gitHubIssueLink.findUnique({
        where: { id: linkId },
        include: LINK_INCLUDE,
      });
      if (!latest || latest.syncRevision !== snapshot.syncRevision)
        throw new GitHubError(409, "github_sync_conflict", "Status changed while synchronizing");
      const accessError = await pauseReason(prisma, latest);
      if (accessError) {
        await prisma.gitHubIssueLink.updateMany({
          where: { id: linkId, syncRevision: latest.syncRevision },
          data: { syncStatus: "paused", syncErrorCode: accessError },
        });
        await emitTask(snapshot.taskId);
        return;
      }
      const desired = desiredGitHubState(snapshot.task.status);
      if (remote.state !== desired) {
        remote = await setGitHubIssueState(repository, snapshot.issueNumber, desired);
        wroteRemote = true;
      }
    }
    const conflicted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${snapshot.taskId}::uuid FOR UPDATE`;
      const link = await tx.gitHubIssueLink.findUnique({
        where: { id: linkId },
        include: LINK_INCLUDE,
      });
      if (!link) return false;
      const paused = await pauseReason(tx, link);
      if (paused) {
        await tx.gitHubIssueLink.update({
          where: { id: linkId },
          data: { syncStatus: "paused", syncErrorCode: paused },
        });
        return false;
      }
      if (link.syncRevision !== snapshot.syncRevision) {
        if (wroteRemote) await enqueueGitHubTaskSync(tx, link.taskId, false);
        return true;
      }
      let status = link.task.status;
      if (event && "event" in event) {
        // Pending local intent wins until its outbox finishes, including an
        // echo of a raced older write. Preserve a user's local Todo reopening.
        if (
          link.desiredState ||
          (link.localStatusAt &&
            (new Date(event.updatedAt) < link.localStatusAt ||
              remote.updatedAt < link.localStatusAt))
        )
          return false;
        if (
          remote.state === link.issueState &&
          link.githubUpdatedAt &&
          new Date(event.updatedAt) <= link.githubUpdatedAt
        )
          return false;
        status = githubTaskStatus(remote.state === "closed" ? "closed" : "reopened", status);
      } else if (event) {
        if (event.pullRequestId) {
          const previous = await tx.gitHubPullRequestLink.findUnique({
            where: {
              issueLinkId_pullRequestId: {
                issueLinkId: linkId,
                pullRequestId: event.pullRequestId,
              },
            },
          });
          if (previous && previous.updatedAt >= event.updatedAt) return false;
          await tx.gitHubPullRequestLink.upsert({
            where: {
              issueLinkId_pullRequestId: {
                issueLinkId: linkId,
                pullRequestId: event.pullRequestId,
              },
            },
            create: {
              issueLinkId: linkId,
              pullRequestId: event.pullRequestId,
              updatedAt: event.updatedAt,
            },
            update: { updatedAt: event.updatedAt },
          });
        }
        if (link.localStatusAt && event.updatedAt < link.localStatusAt) return false;
        status =
          (event.action === "branch" || event.action === "opened") && remote.state === "closed"
            ? "done"
            : githubTaskStatus(event.action, status);
      }
      if (status !== link.task.status) {
        await tx.task.update({ where: { id: link.taskId }, data: { status } });
        await tx.taskEvent.create({
          data: {
            teamId: link.task.teamId,
            taskId: link.taskId,
            actorId: null,
            source: "github",
            githubLogin: event?.actor ?? null,
            fromStatus: link.task.status,
            toStatus: status,
          },
        });
        statusChanged = true;
      }
      // Development events may need to close/reopen the issue; persist that
      // intent atomically, then let a separate outbox do the network write.
      const pending = event && !("event" in event) && remote.state !== desiredGitHubState(status);
      await tx.gitHubIssueLink.update({
        where: { id: linkId },
        data: {
          issueState: remote.state,
          githubUpdatedAt: remote.updatedAt,
          lastSyncedAt: pending ? link.lastSyncedAt : new Date(),
          syncStatus: pending ? "pending" : "synced",
          syncErrorCode: null,
          desiredState: pending ? desiredGitHubState(status) : null,
          syncRevision: { increment: 1 },
        },
      });
      if (pending)
        await tx.gitHubSyncJob.create({ data: { kind: "task", payload: { taskId: link.taskId } } });
      return false;
    });
    if (conflicted)
      throw new GitHubError(409, "github_sync_conflict", "Status changed while synchronizing");
  } catch (error) {
    const code = error instanceof GitHubError ? error.code : "github_sync_failed";
    if (code !== "github_sync_conflict")
      await prisma.gitHubIssueLink.updateMany({
        where: { id: linkId, syncRevision: snapshot.syncRevision },
        data: { syncStatus: "failed", syncErrorCode: code },
      });
    await emitTask(snapshot.taskId);
    throw error;
  }
  await emitTask(snapshot.taskId, statusChanged);
}

async function processLifecycle(event: GitHubInboundEvent, receivedAt: Date): Promise<boolean> {
  if (event.event === "github_app_authorization") {
    await prisma.$transaction(async (tx) => {
      const connection = { githubUserId: BigInt(event.userId), verifiedAt: { lte: receivedAt } };
      await tx.gitHubAccountConnection.updateMany({
        where: connection,
        data: { status: "revoked" },
      });
      await tx.gitHubAccountRepository.updateMany({
        where: { connection },
        data: { enabled: false },
      });
      await tx.gitHubIssueLink.updateMany({
        where: { connection },
        data: {
          syncStatus: "paused",
          syncErrorCode: "github_connection_required",
          syncRevision: { increment: 1 },
        },
      });
    });
    return true;
  }
  if (event.event === "installation") {
    await prisma.$transaction(async (tx) => {
      const installation = {
        githubInstallationId: BigInt(event.installationId),
        lastVerifiedAt: { lte: receivedAt },
      };
      await tx.gitHubInstallation.updateMany({
        where: installation,
        data: {
          status:
            event.action === "deleted"
              ? "removed"
              : event.action === "suspend"
                ? "suspended"
                : "active",
          lastVerifiedAt: receivedAt,
        },
      });
      if (event.action !== "unsuspend") {
        const repository = { installation };
        await tx.gitHubAccountRepository.updateMany({
          where: { repository },
          data: { enabled: false },
        });
        await tx.gitHubIssueLink.updateMany({
          where: { repository },
          data: {
            syncStatus: "paused",
            syncErrorCode: "github_repository_unavailable",
            syncRevision: { increment: 1 },
          },
        });
      }
    });
    return true;
  }
  if (event.event === "installation_repositories") {
    await prisma.$transaction(async (tx) => {
      const repository = {
        installation: { githubInstallationId: BigInt(event.installationId) },
        githubRepositoryId: { in: event.removedIds.map(BigInt) },
        lastVerifiedAt: { lte: receivedAt },
      };
      await tx.gitHubRepository.updateMany({
        where: repository,
        data: { active: false, lastVerifiedAt: receivedAt },
      });
      await tx.gitHubAccountRepository.updateMany({
        where: { repository },
        data: { enabled: false },
      });
      await tx.gitHubIssueLink.updateMany({
        where: { repository },
        data: {
          syncStatus: "paused",
          syncErrorCode: "github_repository_unavailable",
          syncRevision: { increment: 1 },
        },
      });
    });
    return true;
  }
  return false;
}

export async function processGitHubJob(
  kind: string,
  payload: unknown,
  receivedAt = new Date()
): Promise<void> {
  if (kind === "task") {
    const { taskId } = taskPayload.parse(payload);
    const link = await prisma.gitHubIssueLink.findUnique({
      where: { taskId },
      select: { id: true },
    });
    if (link) await syncLink(link.id);
    return;
  }
  const event = githubInboundSchema.parse(payload);
  if (await processLifecycle(event, receivedAt)) return;
  if (!("repositoryId" in event)) return;
  const repository = await prisma.gitHubRepository.findFirst({
    where: {
      githubRepositoryId: BigInt(event.repositoryId),
      active: true,
      installation: { githubInstallationId: BigInt(event.installationId), status: "active" },
    },
    include: { installation: true },
  });
  if (!repository) return;
  if (event.event === "issues") {
    const links = await prisma.gitHubIssueLink.findMany({
      where: {
        repositoryId: repository.id,
        githubIssueId: BigInt(event.issueId),
        issueNumber: event.number,
        status: "linked",
      },
      select: { id: true },
    });
    for (const link of links) await syncLink(link.id, event);
    return;
  }
  if (event.event === "create") {
    const number = branchIssueNumber(event.ref);
    if (number === null) return;
    const links = await prisma.gitHubIssueLink.findMany({
      where: { repositoryId: repository.id, issueNumber: number, status: "linked" },
      select: { id: true },
    });
    for (const link of links)
      await syncLink(link.id, {
        action: "branch",
        actor: event.actor,
        updatedAt: receivedAt,
        ref: event.ref,
      });
    return;
  }
  if (event.event !== "pull_request") return;
  const eligible = await prisma.gitHubIssueLink.count({
    where: {
      repositoryId: repository.id,
      status: "linked",
      connection: {
        status: "active",
        verifiedAt: { gte: new Date(Date.now() - GITHUB_USER_VERIFICATION_TTL_MS) },
        repositories: { some: { repositoryId: repository.id, enabled: true } },
      },
    },
  });
  if (!eligible) return;
  const coordinates = {
    installationId: repository.installation.githubInstallationId,
    repositoryId: repository.githubRepositoryId,
    owner: repository.ownerLogin,
    name: repository.name,
  };
  const pullRequest = await getGitHubPullRequest(coordinates, event.number);
  if (pullRequest.id !== BigInt(event.pullRequestId)) return;
  const branchNumber = branchIssueNumber(pullRequest.branch);
  const numbers = [...pullRequest.issueNumbers, ...(branchNumber === null ? [] : [branchNumber])];
  const links = await prisma.gitHubIssueLink.findMany({
    where: {
      repositoryId: repository.id,
      status: "linked",
      OR: [
        { issueNumber: { in: numbers } },
        { pullRequests: { some: { pullRequestId: pullRequest.id } } },
      ],
    },
    select: { id: true },
  });
  // Edits may establish a new explicit association, but editing a closed
  // PR's body is not another close event (and must not undo a local reopening).
  if (event.action === "edited") {
    for (const link of links)
      await prisma.gitHubPullRequestLink.upsert({
        where: {
          issueLinkId_pullRequestId: { issueLinkId: link.id, pullRequestId: pullRequest.id },
        },
        create: { issueLinkId: link.id, pullRequestId: pullRequest.id, updatedAt: new Date(0) },
        update: {},
      });
    return;
  }
  const matchingState = (event.action === "closed") === (pullRequest.state === "closed");
  for (const link of links)
    await syncLink(link.id, {
      action:
        pullRequest.state === "closed"
          ? "closed"
          : event.action === "reopened" || event.action === "closed"
            ? "reopened"
            : "opened",
      actor: event.actor,
      updatedAt: matchingState ? new Date(event.updatedAt) : pullRequest.updatedAt,
      pullRequestId: pullRequest.id,
    });
}

/** Claims are compare-and-set; leases allow recovery after a process restart. */
export async function drainGitHubSyncJobs(limit = 10): Promise<void> {
  if (!githubConfigured) return;
  for (let index = 0; index < limit; index++) {
    const now = new Date();
    const where = {
      completedAt: null,
      availableAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    };
    const job = await prisma.gitHubSyncJob.findFirst({ where, orderBy: { createdAt: "asc" } });
    if (!job) return;
    const leaseToken = randomUUID();
    const owned = { id: job.id, leaseToken };
    const claimed = await prisma.gitHubSyncJob.updateMany({
      where: { ...where, id: job.id },
      data: {
        leaseToken,
        lockedUntil: new Date(Date.now() + LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    // A PR can affect many tasks. Renew only our own lease, never one a
    // replacement worker acquired after a pause/crash.
    const heartbeat = setInterval(() => {
      void prisma.gitHubSyncJob
        .updateMany({ where: owned, data: { lockedUntil: new Date(Date.now() + LEASE_MS) } })
        .catch((error) => log.error("GitHub sync lease renewal failed", error));
    }, LEASE_MS / 3);
    heartbeat.unref();
    try {
      await processGitHubJob(job.kind, job.payload, job.createdAt);
      await prisma.gitHubSyncJob.updateMany({
        where: owned,
        data: { completedAt: new Date(), lockedUntil: null, leaseToken: null, lastErrorCode: null },
      });
    } catch (error) {
      const code = error instanceof GitHubError ? error.code : "github_sync_failed";
      const delay = Math.min(15 * 60_000, 2000 * 2 ** Math.min(job.attempts, 9));
      await prisma.gitHubSyncJob.updateMany({
        where: owned,
        data: {
          lockedUntil: null,
          leaseToken: null,
          availableAt: new Date(Date.now() + delay),
          lastErrorCode: code,
        },
      });
      log.warn(`GitHub sync job ${job.id} will retry: ${code}`);
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export function startGitHubSyncWorker(): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  const tick = async () => {
    try {
      await drainGitHubSyncJobs();
    } catch (error) {
      log.error("GitHub sync queue unavailable", error);
    }
    if (!stopped) {
      timer = setTimeout(() => {
        running = tick();
      }, POLL_MS);
      timer.unref();
    }
  };
  if (githubConfigured) running = tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await running;
  };
}
