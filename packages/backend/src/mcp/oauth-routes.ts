import OAuth2Server from "@node-oauth/oauth2-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { authClientIp, ipBucket } from "../lib/auth-protection.ts";
import {
  mcpOAuthAuthorizeSchema as flowSchema,
  mcpOAuthRegisterSchema,
  mcpOAuthConsentSchema,
  mcpOAuthTokenSchema,
  mcpOAuthRevokeSchema,
} from "../lib/validation.ts";
import { authRequired, type Vars } from "../middleware/auth.ts";
import { checkLimit, hashCredential, uuid } from "./access.ts";
import {
  requireOAuthConfig,
  isSafeOAuthRedirect,
  MCP_SCOPE,
  ACCESS_SECONDS,
} from "./oauth-config.ts";
import { McpOAuthFailure, handleMcpOAuthError } from "./oauth-errors.ts";
import { storeConsent, readConsent, consumeConsent } from "./oauth-flow.ts";
import { MCP_SCOPES, parseScopes } from "./permissions.ts";
import { eligibleRepositories, validateRepositoryGrant } from "./repositories.ts";
import { oauthModel, oauthServer } from "./oauth-model.ts";

function remotePeer(c: Context): string | undefined {
  return c.env?.incoming ? getConnInfo(c).remote.address : undefined;
}
function paramsOnce(params: URLSearchParams) {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw new McpOAuthFailure("invalid_request");
    result[key] = value;
  }
  return result;
}
async function form(c: Context) {
  if (c.req.header("content-type")?.split(";")[0]?.trim() !== "application/x-www-form-urlencoded")
    throw new McpOAuthFailure("invalid_request");
  return paramsOnce(new URLSearchParams(await c.req.text()));
}
export const mcpOAuthRoutes = new Hono<{ Variables: Vars }>();
mcpOAuthRoutes.onError(handleMcpOAuthError);
mcpOAuthRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  c.header("Referrer-Policy", "no-referrer");
  requireOAuthConfig();
  const peer = remotePeer(c);
  await checkLimit("mcpOAuthGlobal", "global");
  await checkLimit(
    "mcpOAuthPeer",
    ipBucket(authClientIp(c.req.raw.headers, peer, env.AUTH_PROXY_SECRET))
  );
  await next();
});
mcpOAuthRoutes.use(
  "*",
  bodyLimit({
    maxSize: 16 * 1024,
    onError: () => {
      throw new McpOAuthFailure("invalid_request", "Request is too large.");
    },
  })
);
mcpOAuthRoutes.post("/register", async (c) => {
  await checkLimit("mcpRegister", "global");
  const input = mcpOAuthRegisterSchema.safeParse(await c.req.json().catch(() => null));
  if (!input.success || input.data.redirect_uris.some((uri) => !isSafeOAuthRedirect(uri)))
    throw new McpOAuthFailure("invalid_client_metadata");
  const row = await prisma.mcpOAuthClient.create({
    data: { name: input.data.client_name, redirectUris: input.data.redirect_uris },
  });
  return c.json(
    {
      client_id: row.id,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      client_name: row.name,
      redirect_uris: row.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: input.data.scope ?? MCP_SCOPES.join(" "),
    },
    201
  );
});
mcpOAuthRoutes.get("/authorize", async (c) => {
  const config = requireOAuthConfig();
  const parsed = flowSchema.safeParse(paramsOnce(new URL(c.req.url).searchParams));
  if (!parsed.success)
    throw new McpOAuthFailure(
      "invalid_request",
      "Use an authorization code request with PKCE S256."
    );
  const params = parsed.data;
  if (params.resource !== config.resource) throw new McpOAuthFailure("invalid_target");
  const client = await prisma.mcpOAuthClient.findUnique({ where: { id: params.client_id } });
  if (!client) throw new McpOAuthFailure("invalid_client");
  if (!client.redirectUris.includes(params.redirect_uri))
    throw new McpOAuthFailure("invalid_redirect_uri");
  const request = await storeConsent(c, params, client.name);
  return c.redirect(`${config.origin}/mcp/authorize?request=${request}`);
});
mcpOAuthRoutes.use("/consent", authRequired);
mcpOAuthRoutes.get("/consent", async (c) => {
  const { flow } = await readConsent(c, c.req.query("request") ?? "");
  const memberships = await prisma.teamMember.findMany({
    where: { userId: c.get("userId") },
    select: { team: { select: { id: true, name: true } } },
    orderBy: { teamId: "asc" },
  });
  return c.json({
    client: {
      id: flow.params.client_id,
      name: flow.clientName,
      redirect_uri: flow.params.redirect_uri,
    },
    scope: flow.params.scope,
    requested_scopes: parseScopes(flow.params.scope),
    repositories: (await eligibleRepositories(c.get("userId"))).map((repo) => ({
      id: repo.id,
      name: repo.fullName,
      private: repo.private,
    })),
    expires_in_days: 30,
    workspaces: memberships.map((row) => row.team),
  });
});
mcpOAuthRoutes.post("/consent", async (c) => {
  const config = requireOAuthConfig();
  // Cookie authentication requires explicit same-origin POSTs, even if general CORS is open.
  if (c.req.header("Origin") !== config.origin)
    throw new McpOAuthFailure("invalid_request", "Open this request on Mokara to continue.");
  const input = mcpOAuthConsentSchema.safeParse(await c.req.json().catch(() => null));
  if (!input.success) throw new McpOAuthFailure("invalid_request");
  const { flow, raw } = await readConsent(c, input.data.request);
  const params = flow.params;
  const client = await prisma.mcpOAuthClient.findUnique({ where: { id: params.client_id } });
  if (
    !client ||
    !client.redirectUris.includes(params.redirect_uri) ||
    params.resource !== config.resource
  )
    throw new McpOAuthFailure("invalid_request");
  const callback = new URL(params.redirect_uri);
  if (!input.data.approve) {
    await consumeConsent(input.data.request, raw);
    callback.searchParams.set("error", "access_denied");
    if (params.state !== undefined) callback.searchParams.set("state", params.state);
    return c.json({ url: callback.toString() });
  }
  if (!input.data.workspace_ids.length)
    throw new McpOAuthFailure("invalid_request", "Choose at least one workspace.");
  const userId = c.get("userId");
  const members = await prisma.teamMember.findMany({
    where: { userId, teamId: { in: input.data.workspace_ids } },
    select: { teamId: true },
  });
  if (members.length !== input.data.workspace_ids.length)
    throw new McpOAuthFailure("access_denied", "Choose workspaces you belong to.");
  if (input.data.scopes.some((scope) => !parseScopes(params.scope).includes(scope)))
    throw new McpOAuthFailure(
      "invalid_scope",
      "The client did not request that permission. Reconnect with the required scopes."
    );
  await validateRepositoryGrant(userId, input.data.scopes, input.data.repository_ids);
  await checkLimit("mcpIssue", userId);
  await consumeConsent(input.data.request, raw);
  const code = await prisma.$transaction(async (db) =>
    oauthServer(
      oauthModel(db, config.resource, {
        userId,
        workspaceIds: input.data.workspace_ids,
        name: client.name,
        scopes: input.data.scopes,
        repositoryIds: input.data.repository_ids,
      })
    ).authorize(
      new OAuth2Server.Request({ method: "GET", headers: {}, query: params }),
      new OAuth2Server.Response(),
      { authenticateHandler: { handle: async () => ({ id: userId }) } }
    )
  );
  callback.searchParams.set("code", code.authorizationCode);
  if (params.state !== undefined) callback.searchParams.set("state", params.state);
  return c.json({ url: callback.toString() });
});
mcpOAuthRoutes.post("/token", async (c) => {
  const config = requireOAuthConfig();
  const body = await form(c);
  if (body.resource !== config.resource) throw new McpOAuthFailure("invalid_target");
  if (
    !uuid.safeParse(body.client_id).success ||
    body.client_secret ||
    c.req.header("Authorization")
  )
    throw new McpOAuthFailure("invalid_client");
  if (body.grant_type !== "authorization_code" && body.grant_type !== "refresh_token")
    throw new McpOAuthFailure("unsupported_grant_type");
  if (
    body.grant_type === "authorization_code" &&
    (!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier ?? "") ||
      !isSafeOAuthRedirect(body.redirect_uri ?? ""))
  )
    throw new McpOAuthFailure("invalid_request");
  if (!mcpOAuthTokenSchema.safeParse(body).success) throw new McpOAuthFailure("invalid_request");
  const result = await prisma.$transaction(async (db) => {
    try {
      const token = await oauthServer(oauthModel(db, config.resource)).token(
        new OAuth2Server.Request({
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": String(Buffer.byteLength(new URLSearchParams(body).toString())),
          },
          query: {},
          body,
        }),
        new OAuth2Server.Response()
      );
      return { token };
    } catch (error) {
      // Commit intentional single-use/replay revocations on protocol failures.
      // Infrastructure failures roll back every write.
      if (error instanceof OAuth2Server.OAuthError && error.code >= 400 && error.code < 500)
        return { error };
      throw error;
    }
  });
  if (result.error) throw result.error;
  const token = result.token;
  return c.json({
    access_token: token.accessToken,
    token_type: "Bearer",
    expires_in: Math.max(
      0,
      Math.min(
        ACCESS_SECONDS,
        Math.floor(((token.accessTokenExpiresAt?.getTime() ?? Date.now()) - Date.now()) / 1000)
      )
    ),
    refresh_token: token.refreshToken,
    scope: token.scope?.join(" ") ?? MCP_SCOPE,
  });
});
mcpOAuthRoutes.post("/revoke", async (c) => {
  const body = await form(c);
  if (
    !uuid.safeParse(body.client_id).success ||
    !body.token ||
    body.token.length > 256 ||
    body.client_secret ||
    c.req.header("Authorization")
  )
    throw new McpOAuthFailure("invalid_request");
  if (!mcpOAuthRevokeSchema.safeParse(body).success) throw new McpOAuthFailure("invalid_request");
  const digest = hashCredential(body.token);
  const token = await prisma.mcpOAuthToken.findFirst({
    where: {
      OR: [{ accessHash: digest }, { refreshHash: digest }],
      connection: { clientId: body.client_id, resource: requireOAuthConfig().resource },
    },
    select: { connectionId: true },
  });
  if (token)
    await prisma.mcpConnection.updateMany({
      where: { id: token.connectionId, clientId: body.client_id },
      data: { revokedAt: new Date() },
    });
  return c.body(null, 200);
});
