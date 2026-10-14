import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../db.ts";
import type { Vars } from "../middleware/auth.ts";
import type { McpPrincipal } from "./access.ts";
import { McpFailure } from "./errors.ts";

// Reuse the exact web operations in-process, including validation, ownership,
// notifications, quotas and GitHub policies. No HTTP call, cookie or user token
// is manufactured. Callers expose fixed typed tools, never a generic REST proxy.
export async function domainResponse(
  principal: McpPrincipal,
  path: string,
  method = "GET",
  body?: Record<string, unknown> | FormData
) {
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { username: true },
  });
  if (!user) throw new McpFailure("mcp_not_authenticated", "Account unavailable.", 401);
  const app = new Hono<{ Variables: Vars }>();
  app.onError(
    () =>
      new Response(
        JSON.stringify({
          error: "internal_error",
          message: "The operation could not be completed. Check its activity before retrying.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
  );
  app.use("*", async (c, next) => {
    c.set("userId", principal.userId);
    c.set("username", user.username);
    c.set("jti", principal.connectionId);
    await next();
  });
  if (/^\/teams\/[^/]+\/(?:files|folders)(?:[/?]|$)/.test(path)) {
    const { fileRoutes } = await import("../routes/files.ts");
    app.route("/", fileRoutes);
  } else {
    const [
      { taskRoutes },
      { subtaskRoutes },
      { commentRoutes },
      { projectRoutes },
      { kpiRoutes },
      { attachmentRoutes },
      { githubRoutes },
      { analyticsRoutes },
    ] = await Promise.all([
      import("../routes/tasks.ts"),
      import("../routes/subtasks.ts"),
      import("../routes/comments.ts"),
      import("../routes/projects.ts"),
      import("../routes/kpis.ts"),
      import("../routes/attachments.ts"),
      import("../routes/github.ts"),
      import("../routes/analytics.ts"),
    ]);
    for (const routes of [
      taskRoutes,
      subtaskRoutes,
      commentRoutes,
      projectRoutes,
      kpiRoutes,
      attachmentRoutes,
      githubRoutes,
      analyticsRoutes,
    ])
      app.route("/", routes);
  }
  return app.request(path, {
    method,
    ...(body instanceof FormData
      ? { body }
      : body
        ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
        : {}),
  });
}
const errorSchema = z.object({ error: z.string(), message: z.string() });
export async function domainJson(
  principal: McpPrincipal,
  path: string,
  method = "GET",
  body?: Record<string, unknown> | FormData
): Promise<Record<string, unknown>> {
  const response = await domainResponse(principal, path, method, body);
  if (response.status === 204) return { completed: true };
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = errorSchema.safeParse(data);
    throw new McpFailure(
      failure.success ? failure.data.error : "internal_error",
      failure.success ? failure.data.message : "Operation unavailable.",
      response.status === 400
        ? 400
        : response.status === 403
          ? 403
          : response.status === 404
            ? 404
            : response.status === 409
              ? 409
              : response.status === 413
                ? 413
                : response.status === 429
                  ? 429
                  : 503
    );
  }
  return z.record(z.string(), z.unknown()).parse(data);
}
