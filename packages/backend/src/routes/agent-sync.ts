import { z } from "zod";
import { Hono } from "hono";
import type { Vars } from "../middleware/auth.ts";
import { validate } from "../lib/validate.ts";
import { agentCommandSchema } from "../lib/agent-sync-contract.ts";
import { agentTask, agentCommand, agentHistory, type AgentActor } from "../lib/agent-sync.ts";
import { handleMcpHttpError } from "../mcp/errors.ts";
import { checkLimit } from "../mcp/access.ts";
export const agentSyncRoutes = new Hono<{ Variables: Vars }>();
agentSyncRoutes.onError(handleMcpHttpError);
agentSyncRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
const params = z.object({ workspace: z.uuid(), task: z.uuid() }).strict();
agentSyncRoutes.get("/teams/:workspace/tasks/:task/agent", validate("param", params), async (c) => {
  const actor: AgentActor = { kind: "user", userId: c.get("userId") };
  const detail = await agentTask(
    actor,
    c.req.valid("param").workspace,
    c.req.valid("param").task,
    false
  );
  const history = await agentHistory(actor, {
    workspace_id: c.req.valid("param").workspace,
    task_id: c.req.valid("param").task,
    limit: 10,
  });
  return c.json({ ...detail, history: history.items, next_history_cursor: history.next_cursor });
});
agentSyncRoutes.get(
  "/teams/:workspace/tasks/:task/agent/history",
  validate("param", params),
  async (c) =>
    c.json(
      await agentHistory(
        { kind: "user", userId: c.get("userId") },
        {
          workspace_id: c.req.valid("param").workspace,
          task_id: c.req.valid("param").task,
          limit: 10,
          cursor: c.req.query("cursor"),
        }
      )
    )
);
agentSyncRoutes.post("/agent/commands", validate("json", agentCommandSchema), async (c) => {
  const input = c.req.valid("json");
  await checkLimit("mcpWrite", c.get("userId"));
  return c.json(await agentCommand({ kind: "user", userId: c.get("userId") }, input));
});
