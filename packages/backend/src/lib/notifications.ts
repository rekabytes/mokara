import { getRedis } from "../redis.ts";
import { prisma } from "../db.ts";
import { log } from "./logger.ts";
import { publishToUser } from "./events.ts";
import { Prisma } from "@mokara/db/prisma/generated/client";

// PRD-05: the notification service. Rows live in Postgres (survive devices,
// backfill the drawer on load); each insert is also published to the user's
// Redis channel so connected SSE clients see it instantly.
//
// The payload is whatever the row needs to render + link; the drawer reads
// optional fields off it, so new kinds never need a migration. Types are
// plain strings (see the schema comment). Payload shape by type:
//   invitation          { actor_username, team_name, team_id, invitation_id,
//                          responded? } — responded is set when the invitee
//                          acts, turning the row's buttons into a state chip
//   invitation_accepted { actor_username, team_name, team_id }
//   comment_reply       { actor_username, task_id, task_title, team_id, snippet }
// (due-date reminders are documented phase 2 — they need a scheduler).

// Best-effort delivery: a notification that cannot be written or published
// must never take down the action that generated it (an invite, a reply) —
// log and return.
export async function notify(
  userId: string,
  type: string,
  payload: Prisma.InputJsonValue
): Promise<void> {
  try {
    const row = await prisma.notification.create({
      data: { userId, type, payload },
    });
    await publishToUser(userId, {
      event: "notification",
      data: {
        id: row.id,
        type: row.type,
        payload: row.payload,
        read_at: row.readAt,
        created_at: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    log.error(`could not notify user ${userId} (${type})`, e);
  }
}

// Marks notifications read. `ids: null` means every unread one (the drawer's
// "mark all"); an empty array is a no-op, not "everything".
export async function markRead(userId: string, ids: string[] | null): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return res.count;
}

// PRD-08's flow responder, PRD-05's bookkeeper: when the invitee accepts or
// declines, their invitation notification's payload gains `responded` (so the
// drawer swaps its buttons for a state chip on every device), the row is
// read-marked, and the updated row is republished over SSE. Best-effort, like
// notify.
export async function markInvitationResponded(
  userId: string,
  invitationId: string,
  outcome: "accepted" | "declined"
): Promise<void> {
  try {
    const row = await prisma.notification.findFirst({
      where: {
        userId,
        type: "invitation",
        payload: { path: ["invitation_id"], equals: invitationId },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return;
    const old = row.payload;
    const payload =
      typeof old === "object" && old !== null && !Array.isArray(old)
        ? { ...old, responded: outcome }
        : { responded: outcome };
    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { payload, readAt: row.readAt ?? new Date() },
    });
    await publishToUser(userId, {
      event: "notification",
      data: {
        id: updated.id,
        type: updated.type,
        payload: updated.payload,
        read_at: updated.readAt,
        created_at: updated.createdAt.toISOString(),
      },
    });
  } catch (e) {
    log.error(`could not mark invitation ${invitationId} responded for user ${userId}`, e);
  }
}
