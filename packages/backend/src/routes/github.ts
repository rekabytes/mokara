import { Hono, type Context } from "hono";
import { prisma } from "../db.ts";
import type { Prisma } from "@mokara/db/prisma/generated/client";
import { env, githubConfigured, githubWebhookConfigured } from "../env.ts";
import {
  GitHubError,
  exchangeGitHubCode,
  getGitHubUser,
  githubAuthorizeUrl,
  githubInstallUrl,
  listUserInstallationRepositories,
  listUserInstallations,
  revokeGitHubUserToken,
  createGitHubIssue,
  findIssueByMarker,
  type GitHubInstallationInfo,
  type GitHubIssueInfo,
  type GitHubRepositoryInfo,
} from "../lib/github.ts";
import { consumeGitHubState, createGitHubState } from "../lib/github-state.ts";
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
import type { Vars } from "../middleware/auth.ts";

export const githubRoutes = new Hono<{ Variables: Vars }>();

// Without persisting a GitHub user token, periodic OAuth re-verification is the
// only honest way to notice that a person lost access to an organization while
// the App installation itself remains active.
const USER_VERIFICATION_TTL_MS = GITHUB_USER_VERIFICATION_TTL_MS;

function settingsRedirect(c: Context<{ Variables: Vars }>, result: string) {
  return c.redirect(`/settings?github=${encodeURIComponent(result)}`, 302);
}

async function verifiedGitHubIdentity(code: string) {
  const token = await exchangeGitHubCode(code);
  try {
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
  } finally {
    await revokeGitHubUserToken(token).catch(() => {
      log.warn("temporary GitHub user token could not be revoked");
    });
  }
}

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

async function integrationPayload(userId: string) {
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
    ? Date.now() - connection.verifiedAt.getTime() > USER_VERIFICATION_TTL_MS
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
          repositories: connection.repositories.map(({ repository, enabled }) => ({
            id: repository.id,
            full_name: repository.fullName,
            private: repository.private,
            installation_account: repository.installation.accountLogin,
            enabled,
            available: repository.active && repository.installation.status === "active",
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
        error === "github_repository_forbidden" ? 403 : 409
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

  try {
    const { user: githubUser, installations } = await verifiedGitHubIdentity(code);
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
          },
          update: {
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
            status: "active",
            verifiedAt: new Date(),
          },
        });

        const verifiedIds = installations.map((installation) => installation.info.id);
        await tx.gitHubAccountInstallation.deleteMany({
          where: {
            connectionId: connection.id,
            ...(verifiedIds.length
              ? { installation: { githubInstallationId: { notIn: verifiedIds } } }
              : {}),
          },
        });
        // Preserve explicit activation across refresh, but remove lost access.
        // Switching GitHub identities must never inherit the old user's choices.
        const visibleIds = installations.flatMap((row) =>
          row.repositories.map((repository) => repository.id)
        );
        await tx.gitHubAccountRepository.deleteMany({
          where: {
            connectionId: connection.id,
            ...(previous && previous.githubUserId !== githubUser.id
              ? {}
              : { repository: { githubRepositoryId: { notIn: visibleIds } } }),
          },
        });
        for (const installation of installations) {
          await persistInstallation(
            tx,
            connection.id,
            installation.info,
            installation.repositories
          );
        }
        await tx.gitHubIssueLink.updateMany({
          where: {
            connectionId: connection.id,
            status: "linked",
            repository: { connections: { none: { connectionId: connection.id, enabled: true } } },
          },
          data: { syncStatus: "paused", syncErrorCode: "github_repository_inactive" },
        });
      },
      { timeout: 30_000 }
    );
    await resumeGitHubSync(state.userId);
    return settingsRedirect(c, "connected");
  } catch (error) {
    const code = error instanceof GitHubError ? error.code : "github_unavailable";
    log.warn(`GitHub connection failed for user ${state.userId}: ${code}`);
    return settingsRedirect(c, "failed");
  }
});

githubRoutes.post("/me/integrations/github/refresh", async (c) => {
  if (!githubConfigured) {
    return c.json(
      { error: "github_not_configured", message: "GitHub integration is not configured" },
      409
    );
  }
  // Refresh is OAuth again, not an App-token repository read: only GitHub's
  // user endpoint can preserve the per-user permission intersection for a
  // shared organization installation.
  const state = await createGitHubState({ userId: c.get("userId"), purpose: "oauth" });
  return c.json({ url: githubAuthorizeUrl(state) });
});

githubRoutes.delete("/me/integrations/github", async (c) => {
  const userId = c.get("userId");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    await tx.gitHubIssueLink.updateMany({
      where: { connection: { userId } },
      data: { syncStatus: "paused", syncErrorCode: "github_connection_required" },
    });
    await tx.gitHubAccountConnection.deleteMany({ where: { userId } });
  });
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
  if (error.code === "github_repository_unavailable") return 409;
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

  const link = await prisma.gitHubIssueLink.upsert({
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

  const previousAttemptIsLive =
    link.attemptCount > 1 &&
    (!task.githubIssueLink ||
      (task.githubIssueLink.status === "creating" &&
        Date.now() - task.githubIssueLink.lastAttemptAt.getTime() < 30_000));
  if (previousAttemptIsLive) {
    return c.json(
      { error: "github_publish_in_progress", message: "GitHub issue publishing is in progress" },
      409
    );
  }

  const marker = `<!-- mokara-task:${task.id} -->`;
  try {
    let issue: GitHubIssueInfo | null = null;
    if (link.attemptCount > 1) {
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
