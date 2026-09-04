import { streamSSE } from "hono/streaming";
import type { Hono } from "hono";
import { getRedis } from "../redis.ts";
import { userChannel } from "../lib/events.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-05: the realtime bridge — one SSE connection per signed-in browser,
// fed by the user's Redis pub/sub channel (lib/events.ts). Ping every 25s so
// intermediaries don't reap an idle connection; the duplicated client lives
// only as long as the stream (pub/sub needs a dedicated connection).
export function mountEventsRoute(app: Hono<{ Variables: Vars }>): void {
  app.get("/events", async (c) => {
    const userId = c.get("userId");
    const sub = getRedis().duplicate();
    await sub.connect();
    await sub.subscribe(userChannel(userId));

    return streamSSE(c, async (stream) => {
      let closed = false;
      const onMessage = (_channel: string, message: string): void => {
        if (closed) return;
        void stream.writeSSE({ event: "notification", data: message }).catch(() => {
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
