import { handleMcpHttpError } from "./errors.ts";
import { Hono } from "hono";
import { prisma } from "../db.ts";
import { createMcpConnectionSchema } from "../lib/validation.ts";
import { validate } from "../lib/validate.ts";
import type { Vars } from "../middleware/auth.ts";
import { checkLimit, newCredential, uuid } from "./access.ts";

// Only mounted behind browser-session authentication, never agent auth.
export const mcpConnectionRoutes = new Hono<{ Variables: Vars }>();
mcpConnectionRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
mcpConnectionRoutes.onError(handleMcpHttpError);
const metadataSelect = {
  id: true,
  name: true,
  workspaceIds: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

function connectionResponse(row: {
  id: string;
  name: string;
  workspaceIds: string[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    workspace_ids: row.workspaceIds,
    created_at: row.createdAt.toISOString(),
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
    access: "read" as const,
  };
}
mcpConnectionRoutes.get("/", async (c) => {
  const rows = await prisma.mcpConnection.findMany({
    where: { userId: c.get("userId"), revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: metadataSelect,
  });
  return c.json({ connections: rows.map(connectionResponse) });
});
mcpConnectionRoutes.post("/", validate("json", createMcpConnectionSchema), async (c) => {
  const userId = c.get("userId");
  await checkLimit("mcpIssue", userId);
  const input = c.req.valid("json");
  const memberships = await prisma.teamMember.findMany({
    where: { userId, teamId: { in: input.workspace_ids } },
    select: { teamId: true },
  });
  if (memberships.length !== input.workspace_ids.length)
    return c.json(
      { error: "mcp_workspace_forbidden", message: "Choose workspaces you belong to." },
      403
    );
  const { token, tokenHash } = newCredential();
  const row = await prisma.mcpConnection.create({
    data: {
      userId,
      name: input.name,
      workspaceIds: input.workspace_ids,
      tokenHash,
      expiresAt: new Date(Date.now() + input.expires_in_days * 86_400_000),
    },
    select: metadataSelect,
  });
  c.header("Cache-Control", "no-store");
  return c.json({ connection: connectionResponse(row), token }, 201);
});
mcpConnectionRoutes.delete("/:id", async (c) => {
  const id = uuid.safeParse(c.req.param("id"));
  if (!id.success)
    return c.json({ error: "validation_error", message: "Invalid connection ID." }, 400);
  // Idempotent, user-scoped revocation never reveals another user's connection.
  await prisma.mcpConnection.updateMany({
    where: { id: id.data, userId: c.get("userId"), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return c.body(null, 204);
});
