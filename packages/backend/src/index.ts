import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors.ts";
import { requestLogger } from "./middleware/request-log.ts";
import { authRequired, type Vars } from "./middleware/auth.ts";
import { authRoutes, meHandler, updateMe } from "./routes/auth.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { mountEventsRoute } from "./routes/events.ts";
import { teamRoutes } from "./routes/teams.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { taskRoutes } from "./routes/tasks.ts";
import { projectRoutes } from "./routes/projects.ts";
import { kpiRoutes } from "./routes/kpis.ts";
import { commentRoutes } from "./routes/comments.ts";
import { analyticsRoutes } from "./routes/analytics.ts";
import { validate } from "./lib/validate.ts";
import { updateMeSchema } from "./lib/validation.ts";
import { env } from "./env.ts";
import { connectDB, disconnectDB } from "./db.ts";
import { connectRedis, disconnectRedis } from "./redis.ts";
import { log } from "./lib/logger.ts";

// Dev-time restart hardening: tsx watch spawns the next child before the old
// one has fully drained, so a brief EADDRINUSE window is expected on restarts
// (and on `prisma generate` touching the watched client pre-exclude flag).
const BIND_RETRIES = 5;
const BIND_RETRY_MS = 300;

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

  // 2) Redis — the session-revocation denylist; same fail-fast posture.
  try {
    await connectRedis();
  } catch {
    process.exit(1);
  }

  // 3) App
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
  authed.patch("/me", validate("json", updateMeSchema), async (c) =>
    c.json({ user: await updateMe(c.get("userId"), c.req.valid("json").display_name) })
  );
  authed.route("/notifications", notificationRoutes);
  mountEventsRoute(authed);
  authed.route("/teams", teamRoutes);
  authed.route("/invitations", invitationRoutes);
  authed.route("/", taskRoutes);
  authed.route("/", commentRoutes);
  authed.route("/", analyticsRoutes);
  authed.route("/", projectRoutes);
  authed.route("/", kpiRoutes);

  api.route("/", authed);
  app.route("/api", api);

  // 3) Listen — retry briefly on EADDRINUSE so a restart race with the
  //  previous (still-draining) process doesn't kill the new one.
  let server: ServerType | null = null;
  const startServer = (attempt: number): void => {
    // hostname is explicit (as in the jejak-athlete backend) rather than left to
    // Node's default: inside a container a bind to anything but 0.0.0.0 is
    // unreachable from Coolify's proxy, and the failure looks like a dead app.
    const next = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, () => {
      log.ok("Server running");
    });
    next.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < BIND_RETRIES) {
        log.warn(`port ${env.PORT} busy — retry ${attempt}/${BIND_RETRIES} in ${BIND_RETRY_MS}ms`);
        setTimeout(() => startServer(attempt + 1), BIND_RETRY_MS);
        return;
      }
      log.error(`failed to bind port ${env.PORT}`, err);
      process.exit(1);
    });
    server = next;
  };
  startServer(1);

  // 4) Graceful shutdown — drop idle and live connections immediately so the
  //  listening socket frees before tsx watch's next child tries to bind.
  const shutdown = async (signal: string) => {
    log.warn(`${signal} received, stopping...`);
    const s = server;
    s?.close();
    // Narrowed: the Http2 variant of ServerType lacks closeAllConnections.
    if (s && "closeIdleConnections" in s) s.closeIdleConnections();
    if (s && "closeAllConnections" in s) s.closeAllConnections();
    await disconnectRedis();
    await disconnectDB();
    log.ok("Stopped");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
