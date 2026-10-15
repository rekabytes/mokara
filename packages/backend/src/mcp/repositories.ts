import { prisma } from "../db.ts";
import { ensureGitHubAccess } from "../lib/github-access.ts";
import { GitHubError } from "../lib/github.ts";
import { GITHUB_USER_VERIFICATION_TTL_MS } from "../lib/github-repositories.ts";
import { McpFailure } from "./errors.ts";
import { requireScope, type McpPrincipal } from "./access.ts";

export async function eligibleRepositories(userId: string) {
  try {
    await ensureGitHubAccess(userId);
  } catch (error) {
    if (error instanceof GitHubError)
      throw new McpFailure(error.code, error.message, error.status === 409 ? 409 : 503);
    throw error;
  }
  return prisma.gitHubRepository.findMany({
    where: {
      active: true,
      connections: {
        some: {
          enabled: true,
          connection: {
            userId,
            status: "active",
            verifiedAt: { gt: new Date(Date.now() - GITHUB_USER_VERIFICATION_TTL_MS) },
          },
        },
      },
      installation: {
        status: "active",
        connections: { some: { connection: { userId, status: "active" } } },
      },
    },
    select: { id: true, fullName: true, private: true },
    orderBy: { fullName: "asc" },
  });
}
export async function validateRepositoryGrant(
  userId: string,
  scopes: string[],
  repositoryIds: string[]
) {
  if (!scopes.includes("mokara:github")) {
    if (repositoryIds.length)
      throw new McpFailure(
        "mcp_scope_forbidden",
        "GitHub permission is required for repository access.",
        403
      );
    return;
  }
  const allowed = await eligibleRepositories(userId);
  if (!repositoryIds.length || repositoryIds.some((id) => !allowed.some((repo) => repo.id === id)))
    throw new McpFailure(
      "mcp_repository_forbidden",
      "Choose connected, enabled GitHub repositories you can access. Reconnect GitHub if verification expired.",
      403
    );
}
export async function requireRepository(principal: McpPrincipal, repositoryId: string) {
  requireScope(principal, "mokara:github");
  if (
    !principal.repositoryIds?.includes(repositoryId) ||
    !(await eligibleRepositories(principal.userId)).some((repo) => repo.id === repositoryId)
  )
    throw new McpFailure(
      "mcp_repository_forbidden",
      "This connection cannot access that GitHub repository.",
      403
    );
}
