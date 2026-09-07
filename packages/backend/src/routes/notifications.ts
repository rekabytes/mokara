import { Hono } from "hono";
import { prisma } from "../db.ts";
import { markRead, regenerateDueSoonForUser } from "../lib/notifications.ts";
import { validate } from "../lib/validate.ts";
import { z } from "zod";
import { toNotification } from "../lib/types.ts";
import type { Vars } from "../middleware/auth.ts";

// PRD-05: the drawer's REST surface — list + read marking. Live delivery is
// routes/events.ts (SSE over Redis); this backfills on load and persists the
// read state.

export const notificationRoutes = new Hono<{ Variables: Vars }>();

const readSchema = z
  .object({
    // null (or absent) = mark every unread notification read ("mark all").
    ids: z.array(z.string().uuid()).max(100).nullish(),
  })
  .strict();

notificationRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  // PRD-11 §1.5 (now persistent rows): the drawer's first load is also the
  // session-start catch-up — bring the user's due-soon rows in line with the
  // current matching set before returning, so a stale row from before a
  // status change never lingers unread across devices. Mutation hooks keep
  // things tight between requests; this is the safety net.
  await regenerateDueSoonForUser(userId);
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return c.json({ notifications: rows.map(toNotification), unread_count: unread });
});

notificationRoutes.post("/read", validate("json", readSchema), async (c) => {
  const userId = c.get("userId");
  const { ids } = c.req.valid("json");
  const count = await markRead(userId, ids ?? null);
  return c.json({ marked: count });
});
