import { getRedis } from "../redis.ts";

// PRD-05: the generic realtime wire. One SSE endpoint (routes/events.ts)
// bridges Redis pub/sub to the browser; anything that wants to reach user
// <id> live publishes JSON to their channel. The `user:<id>` topic was
// reserved for notifications in the 2026-08-21 realtime decision.
export const userChannel = (userId: string): string => `mokara:user:${userId}`;

export interface UserEvent {
  event: string;
  data: unknown;
}

export async function publishToUser(userId: string, event: UserEvent): Promise<void> {
  await getRedis().publish(userChannel(userId), JSON.stringify(event));
}
