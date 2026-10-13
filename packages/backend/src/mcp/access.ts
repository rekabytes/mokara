import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.ts";
import { getRedis } from "../redis.ts";
import { env } from "../env.ts";
import { consumeAuthLimit } from "../lib/auth-protection.ts";
import { getTeamRole } from "../lib/team-membership.ts";

import { mcpOAuthConfig } from "./oauth-config.ts";
import type { McpScope } from "./permissions.ts";
import { McpFailure } from "./errors.ts";

export type McpPrincipal = {
  connectionId: string;
  userId: string;
  workspaceIds: string[];
  scopes?: string[];
  repositoryIds?: string[];
};
export function requireScope(principal: McpPrincipal, scope: McpScope) {
  if (!(principal.scopes ?? ["mokara:read"]).includes(scope))
    throw new McpFailure(
      "mcp_scope_forbidden",
      "This connection does not have that permission. Reconnect and approve the required access.",
      403
    );
}
export const uuid = z.string().uuid();
export function newCredential() {
  const token = `mk_mcp_${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashCredential(token) };
}
export function hashCredential(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function checkLimit(
  scope: "mcp" | "mcpWrite" | "mcpIssue" | "mcpOAuthPeer" | "mcpOAuthGlobal" | "mcpRegister",
  identity: string
) {
  let retry: number;
  try {
    retry = await consumeAuthLimit(getRedis(), scope, identity, env.AUTH_SECRET);
  } catch {
    throw new McpFailure("service_unavailable", "Agent access is temporarily unavailable.", 503);
  }
  if (retry)
    throw new McpFailure(
      "mcp_rate_limited",
      "Too many agent requests. Try again later.",
      429,
      retry
    );
}

export async function authenticateAgent(authorization: string | undefined): Promise<McpPrincipal> {
  const match = /^Bearer ((?:mk_mcp_|mk_oat_)[A-Za-z0-9_-]{43})$/i.exec(authorization ?? "");
  if (!match?.[1])
    throw new McpFailure("mcp_not_authenticated", "A valid agent credential is required.", 401);
  const raw = match[1];
  let connection;
  let tokenScopes: string[] | undefined;
  if (raw.startsWith("mk_oat_")) {
    const config = mcpOAuthConfig();
    const token = config
      ? await prisma.mcpOAuthToken.findUnique({
          where: { accessHash: hashCredential(raw) },
          include: { connection: true },
        })
      : null;
    tokenScopes = token?.scopes ?? ["mokara:read"];
    connection =
      token &&
      token.accessExpiresAt > new Date() &&
      token.connection.clientId &&
      token.connection.resource === config?.resource
        ? token.connection
        : null;
  } else {
    connection = await prisma.mcpConnection.findUnique({
      where: { tokenHash: hashCredential(raw) },
    });
  }
  if (!connection || connection.revokedAt || connection.expiresAt <= new Date())
    throw new McpFailure("mcp_not_authenticated", "Agent credential expired or revoked.", 401);
  await checkLimit("mcp", connection.id);
  return {
    connectionId: connection.id,
    userId: connection.userId,
    workspaceIds: connection.workspaceIds,
    scopes: (connection.scopes ?? ["mokara:read"]).filter(
      (scope) => !tokenScopes || tokenScopes.includes(scope)
    ),
    repositoryIds: connection.repositoryIds ?? [],
  };
}

export async function requireWorkspace(principal: McpPrincipal, workspaceId: string) {
  if (
    !principal.workspaceIds.includes(workspaceId) ||
    !(await getTeamRole(principal.userId, workspaceId))
  )
    throw new McpFailure(
      "mcp_workspace_forbidden",
      "This connection cannot access that workspace.",
      403
    );
}
