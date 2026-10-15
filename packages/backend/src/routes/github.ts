import { Hono, type Context } from "hono";
import { prisma } from "../db.ts";
import { env, githubConfigured, githubWebhookConfigured } from "../env.ts";
import {
  GitHubError,
  exchangeGitHubCode,
  revokeGitHubUserToken,
  githubAuthorizeUrl,
  githubInstallUrl,
  createGitHubIssue,
  getGitHubIssue,
  findIssueByMarker,
  type GitHubIssueInfo,
} from "../lib/github.ts";
import { consumeGitHubState, createGitHubState } from "../lib/github-state.ts";
import { isUniqueViolation } from "../lib/db-error.ts";
import { log } from "../lib/logger.ts";
import { getTeamRole } from "../lib/team-membership.ts";
import { validate } from "../lib/validate.ts";
import { githubIssueSchema, githubRepositoriesSchema } from "../lib/validation.ts";
import { GITHUB_REPOSITORY_LIMIT } from "../lib/plans.ts";
import { TASK_INCLUDE, taskResponse } from "../lib/task-response.ts";
import {
  activateGitHubRepositories,
  GITHUB_USER_VERIFICATION_TTL_MS,
} from "../lib/github-repositories.ts";
import { enqueueGitHubTaskSync, resumeGitHubSync } from "../lib/github-sync.ts";
import {
  ensureGitHubAccess,
  readGitHubIdentity,
  persistGitHubAccess,
} from "../lib/github-access.ts";
import { encryptGitHubCredentials, decryptGitHubCredentials } from "../lib/github-credentials.ts";
import type { Vars } from "../middleware/auth.ts";

export const githubRoutes = new Hono<{ Variables: Vars }>();

const USER_VERIFICATION_TTL_MS = GITHUB_USER_VERIFICATION_TTL_MS;

function settingsRedirect(c: Context<{ Variables: Vars }>, result: string) {
  return c.redirect(`/settings?github=${encodeURIComponent(result)}`, 302);
}

async function integrationPayload(userId: string) {
  let verificationError: string | null = null;
  if (githubConfigured) {
    try {
      await ensureGitHubAccess(userId);
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      verificationError = error.code;
    }
  }
  const connection = await prisma.gitHubAccountConnection.findUnique({
    where: { userId },
    include: {
      repositories: {
        include: { repository: { include: { installation: true } } },
        orderBy: { repository: { fullName: "asc" } },
      },
    },
  });
  const needsReauthorization = connection
    ? connection.status !== "active" ||
      verificationError === "github_reauthorization_required" ||
      !connection.credentialsEncrypted
    : false;
  return {
    configured: githubConfigured,
    sync_configured: githubWebhookConfigured,
    repository_limit: GITHUB_REPOSITORY_LIMIT,
    connection: connection
      ? {
          github_login: connection.githubLogin,
          status: connection.status,
          reauthorization_required: needsReauthorization,
          verification_error: needsReauthorization ? null : verificationError,
          repositories: connection.repositories.map(({ repository, enabled }) => ({
            id: repository.id,
            full_name: repository.fullName,
            private: repository.private,
            installation_account: repository.installation.accountLogin,
            enabled,
            available:
              connection.status === "active" &&
              repository.active &&
              repository.installation.status === "active",
          })),
        }
      : null,
  };
}

githubRoutes.get("/me/integrations/github", async (c) => {
  return c.json(await integrationPayload(c.get("userId")));
});

githubRoutes.put(
  "/me/integrations/github/repositories",
  validate("json", githubRepositoriesSchema),
  async (c) => {
    if (!githubConfigured)
      return c.json(
        { error: "github_not_configured", message: "GitHub integration is not configured" },
        409
      );
    const error = await activateGitHubRepositories(
      c.get("userId"),
      c.req.valid("json").repository_ids
    );
    if (error)
      return c.json(
        {
          error,
          message:
            error === "github_repository_limit"
              ? `Activate at most ${GITHUB_REPOSITORY_LIMIT} repositories`
              : "Repository selection could not be saved",
        },
        error === "github_repository_forbidden"
          ? 403
          : [
                "github_unavailable",
                "github_verification_pending",
                "github_credentials_unavailable",
                "github_rate_limited",
              ].includes(error)
            ? 503
            : 409
      );
    await resumeGitHubSync(c.get("userId"));
    return c.json(await integrationPayload(c.get("userId")));
  }
);

githubRoutes.post("/me/integrations/github/connect", async (c) => {
  if (!githubConfigured) {
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  }
  const state = await createGitHubState({ userId: c.get("userId"), purpose: "oauth" });
  return c.json({ url: githubAuthorizeUrl(state) });
});

githubRoutes.post("/me/integrations/github/install", async (c) => {
  if (!githubConfigured) {
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  }
  const state = await createGitHubState({ userId: c.get("userId"), purpose: "install" });
  return c.json({ url: githubInstallUrl(state) });
});

githubRoutes.get("/integrations/github/callback", async (c) => {
  const stateValue = c.req.query("state") ?? "";
  const state = await consumeGitHubState(stateValue);
  if (!state || state.userId !== c.get("userId")) return settingsRedirect(c, "state_expired");
  if (c.req.query("error")) return settingsRedirect(c, "denied");

  // GitHub's setup callback can arrive before OAuth authorization. Bind the
  // claimed installation to a fresh, single-use OAuth state; the next callback
  // verifies it against /user/installations before anything is persisted.
  if (state.purpose === "install") {
    const installationId = c.req.query("installation_id") ?? "";
    if (!/^\d+$/.test(installationId)) return settingsRedirect(c, "installation_unverified");
    const oauthState = await createGitHubState({
      userId: state.userId,
      purpose: "oauth",
      pendingInstallationId: installationId,
    });
    return c.redirect(githubAuthorizeUrl(oauthState), 302);
  }

  const code = c.req.query("code") ?? "";
  if (!code) return settingsRedirect(c, "failed");

  let unusedToken: string | null = null;
  try {
    const credentials = await exchangeGitHubCode(code);
    unusedToken = credentials.accessToken;
    const identity = await readGitHubIdentity(credentials.accessToken);
    const { user: githubUser, installations } = identity;
    const credentialsEncrypted = encryptGitHubCredentials(state.userId, credentials);
    if (
      state.pendingInstallationId &&
      !installations.some((row) => row.info.id.toString() === state.pendingInstallationId)
    ) {
      return settingsRedirect(c, "installation_unverified");
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${state.userId}::uuid FOR UPDATE`;
        const previous = await tx.gitHubAccountConnection.findUnique({
          where: { userId: state.userId },
        });
        const connection = await tx.gitHubAccountConnection.upsert({
          where: { userId: state.userId },
          create: {
            userId: state.userId,
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
            status: "active",
            verifiedAt: new Date(),
            credentialsEncrypted,
            verificationRetryAt: null,
            refreshLeaseId: null,
            refreshLeaseUntil: null,
          },
          update: {
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
            status: "active",
            verifiedAt: new Date(),
            credentialsEncrypted,
            verificationRetryAt: null,
            refreshLeaseId: null,
            refreshLeaseUntil: null,
          },
        });

        await persistGitHubAccess(
          tx,
          connection.id,
          identity,
          previous !== null && previous.githubUserId !== githubUser.id
        );
      },
      { timeout: 30_000 }
    );
    unusedToken = null;
    await resumeGitHubSync(state.userId);
    return settingsRedirect(c, "connected");
  } catch (error) {
    const code = error instanceof GitHubError ? error.code : "github_unavailable";
    log.warn(`GitHub connection failed for user ${state.userId}: ${code}`);
    return settingsRedirect(c, "failed");
  } finally {
    if (unusedToken)
      await revokeGitHubUserToken(unusedToken).catch(() =>
        log.warn("unused GitHub token could not be revoked")
      );
  }
});

githubRoutes.post("/me/integrations/github/refresh", async (c) => {
  if (!githubConfigured) {
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  }
  try {
    await ensureGitHubAccess(c.get("userId"), true);
    await resumeGitHubSync(c.get("userId"));
    return c.json(await integrationPayload(c.get("userId")));
  } catch (error) {
    if (error instanceof GitHubError)
      return c.json(
        { error: error.code, message: error.message },
        error.status === 409 ? 409 : 503
      );
    throw error;
  }
});

githubRoutes.delete("/me/integrations/github", async (c) => {
  const userId = c.get("userId");
  let discardedCredentials: string | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const connection = await tx.gitHubAccountConnection.findUnique({ where: { userId } });
    discardedCredentials = connection?.credentialsEncrypted ?? null;
    await tx.gitHubIssueLink.updateMany({
      where: { connection: { userId } },
      data: { syncStatus: "paused", syncErrorCode: "github_connection_required" },
    });
    await tx.gitHubAccountConnection.deleteMany({ where: { userId } });
  });
  if (discardedCredentials) {
    try {
      await revokeGitHubUserToken(
        decryptGitHubCredentials(userId, discardedCredentials).accessToken
      );
    } catch {
      log.warn("disconnected GitHub token could not be revoked remotely");
    }
  }
  return c.body(null, 204);
});

function issueResponse(link: {
  status: string;
  repositoryId: string;
  repositoryFullName: string;
  issueNumber: number | null;
  issueUrl: string | null;
  createdByUserId: string | null;
  lastErrorCode: string | null;
  syncStatus: string;
  syncErrorCode: string | null;
  lastSyncedAt: Date | null;
}) {
  return {
    status: link.status,
    repository_id: link.repositoryId,
    repository_full_name: link.repositoryFullName,
    issue_number: link.issueNumber,
    issue_url: link.issueUrl,
    created_by_user_id: link.createdByUserId,
    last_error_code: link.lastErrorCode,
    sync_status: link.syncStatus,
    sync_error_code: link.syncErrorCode,
    last_synced_at: link.lastSyncedAt?.toISOString() ?? null,
  };
}

function issueBody(task: {
  id: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignee: { username: string; displayName: string | null } | null;
}): string {
  const lines: string[] = [];
  if (task.description?.trim()) lines.push(task.description.trim(), "", "---", "");
  lines.push("Mokara task metadata");
  lines.push(`- Priority: ${task.priority}`);
  lines.push(`- Status: ${task.status}`);
  if (task.dueDate) lines.push(`- Due: ${task.dueDate.toISOString().slice(0, 10)}`);
  if (task.assignee) {
    lines.push(`- Assignee: ${task.assignee.displayName || `@${task.assignee.username}`}`);
  }
  if (env.GITHUB_PUBLIC_APP_URL) {
    const url = new URL("/tasks", env.GITHUB_PUBLIC_APP_URL);
    lines.push(`- Mokara: ${url.toString()}`);
  }
  lines.push("", `<!-- mokara-task:${task.id} -->`);
  return lines.join("\n");
}

function githubStatus(error: GitHubError): 403 | 409 | 429 | 503 {
  if (error.code === "github_access_denied") return 403;
  if (
    error.code === "github_repository_unavailable" ||
    error.code === "github_issue_already_linked" ||
    error.code === "github_invalid_issue"
  )
    return 409;
  if (error.code === "github_rate_limited") return 429;
  return 503;
}

async function persistLinkedIssue(linkId: string, issue: GitHubIssueInfo) {
  return prisma.$transaction(async (tx) => {
    const linked = await tx.gitHubIssueLink.update({
      where: { id: linkId },
      data: {
        status: "linked",
        githubIssueId: issue.id,
        issueNumber: issue.number,
        issueUrl: issue.htmlUrl,
        lastErrorCode: null,
        linkedAt: new Date(),
        issueState: issue.state,
        githubUpdatedAt: issue.updatedAt,
      },
    });
    await enqueueGitHubTaskSync(tx, linked.taskId);
    return tx.gitHubIssueLink.findUniqueOrThrow({ where: { id: linkId } });
  });
}

githubRoutes.post("/tasks/:id/github-sync", async (c) => {
  if (!githubConfigured)
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  const taskId = c.req.param("id");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { githubIssueLink: true },
  });
  if (!task) return c.json({ error: "not_found", message: "Task not found" }, 404);
  if (!(await getTeamRole(c.get("userId"), task.teamId)))
    return c.json({ error: "forbidden", message: "Not a member of this container" }, 403);
  if (!task.githubIssueLink || task.githubIssueLink.status !== "linked")
    return c.json({ error: "github_issue_not_linked", message: "Task has no linked issue" }, 409);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
    await enqueueGitHubTaskSync(tx, taskId, false);
  });
  return c.json(
    taskResponse(
      await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_INCLUDE })
    )
  );
});

githubRoutes.post("/tasks/:id/github-issue", validate("json", githubIssueSchema), async (c) => {
  if (!githubConfigured) {
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  }
  const userId = c.get("userId");
  const taskId = c.req.param("id")!;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { username: true, displayName: true } },
      githubIssueLink: true,
    },
  });
  if (!task) return c.json({ error: "not_found", message: "task not found" }, 404);
  if (!(await getTeamRole(userId, task.teamId))) {
    return c.json({ error: "forbidden", message: "not a member of this task's team" }, 403);
  }

  try {
    await ensureGitHubAccess(userId);
  } catch (error) {
    if (error instanceof GitHubError)
      return c.json(
        { error: error.code, message: error.message },
        error.status === 409 ? 409 : 503
      );
    throw error;
  }

  const repository = await prisma.gitHubRepository.findFirst({
    where: {
      id: c.req.valid("json").repository_id,
      active: true,
      installation: {
        status: "active",
        connections: { some: { connection: { userId, status: "active" } } },
      },
      connections: { some: { enabled: true, connection: { userId, status: "active" } } },
    },
    include: { installation: true },
  });
  if (!repository) {
    return c.json(
      {
        error: "github_repository_forbidden",
        message: "this repository is not connected to your GitHub account",
      },
      403
    );
  }
  if (task.githubIssueLink?.status === "linked") {
    return c.json(
      {
        error: "github_issue_already_linked",
        message: "this task already has a GitHub issue",
      },
      409
    );
  }

  const connection = await prisma.gitHubAccountConnection.findUnique({ where: { userId } });
  if (!connection) {
    return c.json({ error: "github_connection_required", message: "connect GitHub first" }, 409);
  }
  if (Date.now() - connection.verifiedAt.getTime() > USER_VERIFICATION_TTL_MS) {
    return c.json(
      {
        error: "github_reauthorization_required",
        message: "reconnect GitHub to verify your repository access",
      },
      409
    );
  }

  const reservation = await prisma.$transaction(async (tx) => {
    // Claim before touching the link. A competing publisher must not replace
    // its repository while the first request is making an external API call.
    await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
    const current = await tx.gitHubIssueLink.findUnique({ where: { taskId } });
    if (current?.status === "linked")
      return {
        error: "github_issue_already_linked",
        message: "This task already has a GitHub issue.",
      };
    if (current?.status === "creating" && Date.now() - current.lastAttemptAt.getTime() < 120_000)
      return {
        error: "github_publish_in_progress",
        message: "GitHub issue publishing is in progress. Inspect the task before retrying.",
      };
    const link = await tx.gitHubIssueLink.upsert({
      where: { taskId },
      create: {
        taskId,
        repositoryId: repository.id,
        createdByUserId: userId,
        connectionId: connection.id,
        repositoryFullName: repository.fullName,
        status: "creating",
      },
      update: {
        repositoryId: repository.id,
        createdByUserId: userId,
        connectionId: connection.id,
        repositoryFullName: repository.fullName,
        status: "creating",
        lastErrorCode: null,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return { link };
  });
  if (!reservation.link)
    return c.json({ error: reservation.error, message: reservation.message }, 409);
  const link = reservation.link;
  const marker = `<!-- mokara-task:${task.id} -->`;
  try {
    const requestedNumber = c.req.valid("json").issue_number;
    let issue: GitHubIssueInfo | null = requestedNumber
      ? await getGitHubIssue(
          {
            installationId: repository.installation.githubInstallationId,
            repositoryId: repository.githubRepositoryId,
            owner: repository.ownerLogin,
            name: repository.name,
          },
          requestedNumber
        )
      : null;
    if (!issue && link.attemptCount > 1) {
      issue = await findIssueByMarker(
        repository.installation.githubInstallationId,
        repository.ownerLogin,
        repository.name,
        marker
      );
    }
    issue ??= await createGitHubIssue(
      repository.installation.githubInstallationId,
      repository.ownerLogin,
      repository.name,
      task.title,
      issueBody(task)
    );
    const linked = await persistLinkedIssue(link.id, issue);
    return c.json({ github_issue: issueResponse(linked) }, 201);
  } catch (error) {
    const githubError =
      error instanceof GitHubError
        ? error
        : isUniqueViolation(error, "github_issue_links_repository_issue_linked_key")
          ? new GitHubError(
              409,
              "github_issue_already_linked",
              "This GitHub issue is already linked to another task"
            )
          : new GitHubError(0, "github_publish_failed", "GitHub issue creation failed");
    await prisma.gitHubIssueLink.update({
      where: { id: link.id },
      data: { status: "failed", lastErrorCode: githubError.code },
    });
    log.warn(`GitHub issue publish failed for task ${task.id}: ${githubError.code}`);
    return c.json(
      { error: githubError.code, message: "the GitHub issue could not be created" },
      githubStatus(githubError)
    );
  }
});
