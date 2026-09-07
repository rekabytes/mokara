import { getRedis } from "../redis.ts";

// PRD-05: the generic realtime wire. One SSE endpoint (routes/events.ts)
// bridges Redis pub/sub to the browser; anything that wants to reach a
// audience live publishes JSON to its channel. The `user:<id>` topic was
// reserved for notifications in the 2026-08-21 realtime decision; the
// `team:<id>` topic (2026-09-07) carries board events to every member of a
// workspace — the bridge authorizes by membership at connect time, so a
// client only ever receives channels for teams it belongs to.
export const userChannel = (userId: string): string => `mokara:user:${userId}`;
export const teamChannel = (teamId: string): string => `mokara:team:${teamId}`;

export interface RealtimeEvent {
  event: string;
  data: unknown;
}

export async function publishToUser(userId: string, event: RealtimeEvent): Promise<void> {
  await getRedis().publish(userChannel(userId), JSON.stringify(event));
}

export async function publishToTeam(teamId: string, event: RealtimeEvent): Promise<void> {
  await getRedis().publish(teamChannel(teamId), JSON.stringify(event));
}
