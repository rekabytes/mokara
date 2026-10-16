import { streamSSE } from "hono/streaming";
import type { Hono } from "hono";
import { getRedis } from "../redis.ts";
import { prisma } from "../db.ts";
import { teamChannel, userChannel } from "../lib/events.ts";
import { isSessionValid } from "../lib/sessions.ts";
import { log } from "../lib/logger.ts";
import type { Vars } from "../middleware/auth.ts";

const HEARTBEAT_MS = 25_000;
// Bound work retained behind a slow reader/check. Closing forces the existing
// EventSource reconnect/refetch path instead of retaining an unlimited backlog.
const MAX_PENDING_FRAMES = 32;

function eventName(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "event" in parsed &&
      typeof parsed.event === "string"
    )
      return parsed.event;
  } catch {
    // Preserve the generic message fallback for unnamed/malformed envelopes.
  }
  return "message";
}

// One stream per browser tab, multiplexing personal notifications and workspace
// events. The initial subscription is routing, never a lasting access grant:
// check current membership and session validity before every frame and heartbeat.
export function mountEventsRoute(app: Hono<{ Variables: Vars }>): void {
  app.get("/events", async (c) => {
    const claims = c.get("session");
    const expiresAt = claims?.exp === undefined ? NaN : claims.exp * 1000;
    if (!claims || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
      return c.json({ error: "not_authenticated", message: "session expired" }, 401);

    const userId = claims.sub;
    const readAccess = () =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { memberships: { select: { teamId: true } } },
      });
    const user = await readAccess();
    if (!user) return c.json({ error: "not_authenticated", message: "session expired" }, 401);

    const personalChannel = userChannel(userId);
    const channels = new Set(user.memberships.map((m) => teamChannel(m.teamId)));
    const redis = getRedis();
    const sub = redis.duplicate();
    let stop = (): void => {};
    let subscriberUnavailable = false;
    const onSubscriberError = (): void => {
      subscriberUnavailable = true;
      log.warn("live updates subscriber unavailable — closing stream");
      stop();
    };
    const onSubscriberClose = (): void => {
      subscriberUnavailable = true;
      stop();
    };
    sub.on("error", onSubscriberError);
    sub.on("close", onSubscriberClose);
    try {
      await sub.connect();
      await sub.subscribe(personalChannel, ...channels);
    } catch (error) {
      sub.disconnect();
      throw error; // Existing API error boundary handles pre-stream failures.
    }

    const response = streamSSE(c, async (stream) => {
      let closed = false;
      let pending = 0;
      let work = Promise.resolve();
      let finish = (): void => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      stop = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        sub.off("message", onMessage);
        sub.off("close", onSubscriberClose);
        sub.disconnect();
        stream.abort();
        finish();
      };

      const enqueue = (channel: string | null, message: string): void => {
        if (closed || (channel !== null && channel !== personalChannel && !channels.has(channel)))
          return;
        if (pending >= MAX_PENDING_FRAMES) {
          stop();
          return;
        }
        pending++;
        work = work
          .then(async () => {
            if (closed) return;
            if (Date.now() >= expiresAt) return stop();
            const current = await readAccess();
            const allowed = new Set(current?.memberships.map((m) => teamChannel(m.teamId)));
            // A removal closes the whole stream; reconnect subscribes only to
            // current workspaces. No cached membership authorizes queued frames.
            if (!current || [...channels].some((name) => !allowed.has(name))) return stop();
            if (!(await isSessionValid(redis, claims))) return stop();
            if (closed || Date.now() >= expiresAt) return stop();
            await stream.writeSSE({
              event: channel === null ? "ping" : eventName(message),
              data: message,
            });
          })
          .catch(() => {
            // Neither provider errors nor event contents belong in logs/frames.
            log.warn("live updates access check or delivery unavailable — closing stream");
            stop();
          })
          .finally(() => {
            pending--;
          });
      };
      const onMessage = (channel: string, message: string): void => enqueue(channel, message);
      const heartbeat = setInterval(() => enqueue(null, "1"), HEARTBEAT_MS);
      const expiry = setTimeout(stop, Math.min(expiresAt - Date.now(), 2_147_483_647));
      sub.on("message", onMessage);
      stream.onAbort(stop);
      c.req.raw.signal.addEventListener("abort", stop, { once: true });
      try {
        // Recheck after async subscription setup, including revocation during it.
        if (subscriberUnavailable || c.req.raw.signal.aborted || stream.aborted) stop();
        else enqueue(null, "1");
        await finished;
      } finally {
        stop();
        c.req.raw.signal.removeEventListener("abort", stop);
      }
    });
    // Hono sets no-cache internally; authenticated streams must not be stored.
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
