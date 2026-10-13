import OAuth2Server from "@node-oauth/oauth2-server";
import type { Prisma } from "@mokara/db/prisma/generated/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashCredential } from "./access.ts";
import { validScopes, MCP_SCOPES } from "./permissions.ts";
import { ACCESS_SECONDS, GRANT_SECONDS, MCP_SCOPE } from "./oauth-config.ts";

const userSchema = z.object({ id: z.uuid(), connection_id: z.uuid().optional() });
const codeSchema = z.object({
  authorizationCode: z.string(),
  expiresAt: z.date(),
  redirectUri: z.string(),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  codeChallengeMethod: z.literal("S256"),
});
const tokenSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.date(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.date(),
  scope: z.array(z.enum(MCP_SCOPES)).default(["mokara:read"]),
});
export const oauthSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
type Approval = {
  userId: string;
  workspaceIds: string[];
  name: string;
  scopes?: string[];
  repositoryIds?: string[];
};

// Instantiate per transaction/request. Never share an authenticated model across
// users, and never keep a database transaction open across provider/network calls.
export function oauthModel(
  db: Prisma.TransactionClient,
  resource: string,
  approval?: Approval
): OAuth2Server.AuthorizationCodeModel & OAuth2Server.RefreshTokenModel {
  const client = (id: string, redirectUris: string[] = []): OAuth2Server.Client => ({
    id,
    redirectUris,
    grants: ["authorization_code", "refresh_token"],
  });
  return {
    async getClient(id, secret) {
      if (secret || !z.uuid().safeParse(id).success) return false;
      const row = await db.mcpOAuthClient.findUnique({ where: { id } });
      return row ? client(row.id, row.redirectUris) : false;
    },
    async validateScope(user, _client, scope) {
      if (!scope || !validScopes(scope)) return false;
      if (approval)
        return (approval.scopes ?? [MCP_SCOPE]).every((value) => scope.includes(value))
          ? (approval.scopes ?? [MCP_SCOPE])
          : false;
      const owner = userSchema.safeParse(user);
      if (!owner.success || !owner.data.connection_id) return false;
      const grant = await db.mcpConnection.findFirst({
        where: {
          id: owner.data.connection_id,
          userId: owner.data.id,
          clientId: _client.id,
          resource,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      return grant && scope.every((value) => (grant.scopes ?? [MCP_SCOPE]).includes(value))
        ? scope
        : false;
    },
    async validateRedirectUri(uri, row) {
      return Array.isArray(row.redirectUris) && row.redirectUris.includes(uri);
    },
    async generateAuthorizationCode() {
      return oauthSecret("mk_code_");
    },
    async generateAccessToken() {
      return oauthSecret("mk_oat_");
    },
    async generateRefreshToken() {
      return oauthSecret("mk_ort_");
    },
    async saveAuthorizationCode(code, row, user) {
      const parsed = codeSchema.parse(code);
      const owner = userSchema.parse(user);
      if (!approval || owner.id !== approval.userId)
        throw new OAuth2Server.ServerError("Invalid authorization context");
      const grant = await db.mcpConnection.create({
        data: {
          userId: owner.id,
          name: approval.name,
          workspaceIds: approval.workspaceIds,
          scopes: approval.scopes ?? [MCP_SCOPE],
          repositoryIds: approval.repositoryIds ?? [],
          clientId: row.id,
          resource,
          expiresAt: new Date(Date.now() + GRANT_SECONDS * 1000),
        },
      });
      await db.mcpOAuthCode.create({
        data: {
          codeHash: hashCredential(parsed.authorizationCode),
          connectionId: grant.id,
          redirectUri: parsed.redirectUri,
          challenge: parsed.codeChallenge,
          expiresAt: parsed.expiresAt,
        },
      });
      return {
        ...parsed,
        scope: approval?.scopes ?? [MCP_SCOPE],
        client: row,
        user: { id: owner.id, connection_id: grant.id },
      };
    },
    async getAuthorizationCode(raw) {
      const row = await db.mcpOAuthCode.findUnique({
        where: { codeHash: hashCredential(raw) },
        include: { connection: true },
      });
      const grant = row?.connection;
      if (
        !row ||
        !grant ||
        !grant.clientId ||
        grant.resource !== resource ||
        grant.revokedAt ||
        grant.expiresAt <= new Date()
      )
        return false;
      // Detect reuse even after the five-minute code expiry. The grant may
      // still hold live tokens; protocol failures commit this revocation.
      if (row.consumedAt) {
        await db.mcpConnection.updateMany({
          where: { id: grant.id },
          data: { revokedAt: new Date() },
        });
        return false;
      }
      return {
        authorizationCode: raw,
        expiresAt: row.expiresAt,
        redirectUri: row.redirectUri,
        codeChallenge: row.challenge,
        codeChallengeMethod: "S256",
        scope: grant.scopes ?? [MCP_SCOPE],
        client: client(grant.clientId),
        user: { id: grant.userId, connection_id: grant.id },
      };
    },
    async revokeAuthorizationCode(code) {
      const owner = userSchema.parse(code.user);
      if (!owner.connection_id) return false;
      const consumed = await db.mcpOAuthCode.updateMany({
        where: {
          codeHash: hashCredential(code.authorizationCode),
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 1) return true;
      // Replayed codes invalidate any credentials previously issued from them.
      await db.mcpConnection.updateMany({
        where: { id: owner.connection_id },
        data: { revokedAt: new Date() },
      });
      return false;
    },
    async getRefreshToken(raw) {
      const row = await db.mcpOAuthToken.findUnique({
        where: { refreshHash: hashCredential(raw) },
        include: { connection: true },
      });
      const grant = row?.connection;
      if (
        !row ||
        !grant ||
        !grant.clientId ||
        grant.resource !== resource ||
        grant.revokedAt ||
        grant.expiresAt <= new Date()
      )
        return false;
      // Keep used rows so a replay can revoke the whole token family.
      return {
        refreshToken: raw,
        refreshTokenExpiresAt: row.refreshExpiresAt,
        scope: row.scopes ?? [MCP_SCOPE],
        client: client(grant.clientId),
        user: { id: grant.userId, connection_id: grant.id },
      };
    },
    async revokeToken(token) {
      const owner = userSchema.parse(token.user);
      if (!owner.connection_id) return false;
      const consumed = await db.mcpOAuthToken.updateMany({
        where: { refreshHash: hashCredential(token.refreshToken), refreshUsedAt: null },
        data: { refreshUsedAt: new Date() },
      });
      if (consumed.count === 1) return true;
      await db.mcpConnection.updateMany({
        where: { id: owner.connection_id },
        data: { revokedAt: new Date() },
      });
      return false;
    },
    async saveToken(token, row, user) {
      const parsed = tokenSchema.parse(token);
      const owner = userSchema.parse(user);
      if (!owner.connection_id) throw new OAuth2Server.InvalidGrantError("Invalid grant");
      const grant = await db.mcpConnection.findFirst({
        where: {
          id: owner.connection_id,
          userId: owner.id,
          clientId: row.id,
          resource,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!grant) throw new OAuth2Server.InvalidGrantError("Invalid grant");
      if (
        !validScopes(parsed.scope) ||
        parsed.scope.some((scope) => !(grant.scopes ?? [MCP_SCOPE]).includes(scope))
      )
        throw new OAuth2Server.InvalidScopeError("Invalid scope");
      const accessTokenExpiresAt = new Date(
        Math.min(parsed.accessTokenExpiresAt.getTime(), grant.expiresAt.getTime())
      );
      const refreshTokenExpiresAt = new Date(
        Math.min(parsed.refreshTokenExpiresAt.getTime(), grant.expiresAt.getTime())
      );
      await db.mcpOAuthToken.create({
        data: {
          connectionId: grant.id,
          accessHash: hashCredential(parsed.accessToken),
          refreshHash: hashCredential(parsed.refreshToken),
          accessExpiresAt: accessTokenExpiresAt,
          refreshExpiresAt: refreshTokenExpiresAt,
          scopes: parsed.scope,
        },
      });
      return {
        ...parsed,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        scope: parsed.scope,
        client: row,
        user: owner,
      };
    },
    // HTTP resource authentication uses the same stored grant checks in access.ts.
    async getAccessToken() {
      return false;
    },
  };
}

export function oauthServer(model: ReturnType<typeof oauthModel>) {
  return new OAuth2Server({
    model,
    authorizationCodeLifetime: 300,
    accessTokenLifetime: ACCESS_SECONDS,
    refreshTokenLifetime: GRANT_SECONDS,
    allowEmptyState: true,
    alwaysIssueNewRefreshToken: true,
    requireClientAuthentication: { authorization_code: false, refresh_token: false },
  });
}
