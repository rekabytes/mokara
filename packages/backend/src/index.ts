import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors.ts";
import { requestLogger } from "./middleware/request-log.ts";
import { authRequired, type Vars } from "./middleware/auth.ts";
import { authRoutes, meHandler } from "./routes/auth.ts";
import { teamRoutes } from "./routes/teams.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { taskRoutes } from "./routes/tasks.ts";
import { env } from "./env.ts";
import { connectDB, disconnectDB } from "./db.ts";
import { log } from "./lib/logger.ts";

async function main() {
  // Warn before we even try the DB — only if it actually matters.
  if (!env.AUTH_SECRET) {
    log.warn("AUTH_SECRET not set");
  }

  // 1) Database — fail fast on connection issues.
  try {
    await connectDB();
  } catch {
    process.exit(1);
  }

  // 2) App
  const app = new Hono<{ Variables: Vars }>();

  app.onError((err, c) => {
    log.error(`unhandled ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "internal_error", message: "internal server error" }, 500);
  });

  app.use("*", corsMiddleware);
  app.use("*", requestLogger);

  app.get("/health", (c) => c.json({ status: "ok" }));

  const api = new Hono<{ Variables: Vars }>();
  api.route("/auth", authRoutes);

  const authed = new Hono<{ Variables: Vars }>();
  authed.use("*", authRequired);
  authed.get("/me", meHandler);
  authed.route("/teams", teamRoutes);
  authed.route("/invitations", invitationRoutes);
  authed.route("/", taskRoutes);

  api.route("/", authed);
  app.route("/api", api);

  // 3) Listen
  const server = serve({ fetch: app.fetch, port: env.PORT }, () => {
    log.ok("Server running");
  });
  server.on("error", (err) => {
    log.error(`failed to bind port ${env.PORT}`, err);
    process.exit(1);
  });

  // 4) Graceful shutdown
  const shutdown = async (signal: string) => {
    log.warn(`${signal} received, stopping...`);
    server.close();
    await disconnectDB();
    log.ok("Stopped");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
