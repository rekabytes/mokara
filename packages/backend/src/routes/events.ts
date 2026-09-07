import { streamSSE } from "hono/streaming";
import type { Hono } from "hono";
import { getRedis } from "../redis.ts";
import { prisma } from "../db.ts";
import { teamChannel, userChannel } from "../lib/events.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-05: the realtime bridge — one SSE connection per signed-in browser,
// fed by the user's Redis pub/sub channels (lib/events.ts). Ping every 25s so
// intermediaries don't reap an idle connection; the duplicated client lives
// only as long as the stream (pub/sub needs a dedicated connection).
//
// 2026-09-07: the bridge grew from one channel (user → notifications) to
// user + every team the caller belongs to (board events). Membership is read
// AT CONNECT — joining a team mid-session shows up on the next reconnect,
// which is the accepted v1 boundary. The SSE event name comes from the
// envelope's `event` field, so the client can addEventListener per kind;
// notification frames carry event:"notification" and land exactly where they
// always did.
export function mountEventsRoute(app: Hono<{ Variables: Vars }>): void {
  app.get("/events", async (c) => {
    const userId = c.get("userId");
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });

    const sub = getRedis().duplicate();
    await sub.connect();
    await sub.subscribe(userChannel(userId), ...memberships.map((m) => teamChannel(m.teamId)));

    return streamSSE(c, async (stream) => {
      let closed = false;
      const onMessage = (_channel: string, message: string): void => {
        if (closed) return;
        // The envelope names its own SSE event; anything unparseable or
        // unnamed goes out as "message" rather than killing the stream.
        let name = "message";
        try {
          const parsed: unknown = JSON.parse(message);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            typeof (parsed as { event?: unknown }).event === "string"
          ) {
            name = (parsed as { event: string }).event;
          }
        } catch {
          /* fall through with "message" */
        }
        void stream.writeSSE({ event: name, data: message }).catch(() => {
          closed = true;
        });
      };
      sub.on("message", onMessage);
      const ping = setInterval(() => {
        if (closed) return;
        void stream.writeSSE({ event: "ping", data: "1" }).catch(() => {
          closed = true;
        });
      }, 25_000);
      stream.onAbort(() => {
        closed = true;
        clearInterval(ping);
        sub.disconnect();
      });

      // Hold the stream open; writes above fail closed once the client goes.
      while (!closed) {
        await stream.sleep(500);
      }
      clearInterval(ping);
      sub.disconnect();
    });
  });
}
