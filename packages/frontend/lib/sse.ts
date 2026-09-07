"use client";

// One shared EventSource for the whole tab (2026-09-07). The bridge
// (backend routes/events.ts) multiplexes notifications AND board events over
// a single /api/events connection and names each SSE event from the envelope,
// so consumers register per event name instead of each opening their own
// stream. lib/notifications.ts was the only client before this module existed
// and now rides on it too — one connection, one Redis subscriber set server
// side, regardless of how many features listen.
//
// Lifecycle is deliberately app-scoped, like the notifications singleton it
// replaces: the source is created on the first subscription and never closed
// — a sign-out is a hard reload (PRD-08), which resets module state.
// EventSource reconnects by itself; when it does, "sse:reopened" fires so
// listeners (the board) can refetch what the dropped connection missed.

type SseHandler = (data: unknown) => void;

const handlers = new Map<string, Set<SseHandler>>();
let source: EventSource | null = null;
let everOpened = false;

function dispatch(event: string, data: unknown): void {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of set) handler(data);
}

// EventSource needs a listener per event name; attach lazily, when the first
// handler for a name registers. The wire envelope is { event, data }
// (backend lib/events.ts) — handlers receive the UNWRAPPED payload.
function attach(name: string): void {
  if (!source) return;
  source.addEventListener(name, (e: MessageEvent) => {
    try {
      const parsed: unknown = JSON.parse(e.data as string);
      const data =
        parsed !== null && typeof parsed === "object" && "data" in parsed
          ? (parsed as { data: unknown }).data
          : null;
      dispatch(name, data);
    } catch {
      // A malformed frame is dropped, not fatal — the next event still lands.
    }
  });
}

/** Subscribe to one SSE event kind. Returns the unsubscribe. */
export function onSse(event: string, handler: SseHandler): () => void {
  if (!source) {
    source = new EventSource("/api/events");
    source.onopen = () => {
      // The first open is the initial connect (listeners fetch on mount
      // anyway); later opens are reconnects — missed events get refetched.
      if (everOpened) dispatch("sse:reopened", null);
      everOpened = true;
    };
  }
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
    if (event !== "sse:reopened") attach(event); // client-synthetic
  }
  set.add(handler);
  const owned = set;
  return () => {
    owned.delete(handler);
  };
}
