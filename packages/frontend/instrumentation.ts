// Next.js calls `register()` once when the server boots (both `next dev` and
// `next start`). Used here to ping the backend's /health endpoint so we can
// see the connection state in the terminal.
//
// Logs:
//   ✓ Backend reachable at http://localhost:4200/health (12ms)
//   ✗ Backend unreachable at http://localhost:4200/health: <reason>
//
// After the first ping, subsequent pings only log on state change (up→down or
// down→up), so a healthy connection stays quiet.
//
// The target is BACKEND_URL (see lib/backend-url.ts), so this works unchanged
// inside a container, where the browser-facing /api proxy would be meaningless.

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

import { getBackendUrl } from "./lib/backend-url";

function getHealthUrl(): string {
  // Absolute and server-side on purpose: this runs in the Next process, not the
  // browser, so it talks to the backend directly over the container network
  // rather than through the /api proxy (which would resolve only in a browser).
  return getBackendUrl() + "/health";
}

type State = "unknown" | "up" | "down";
let lastState: State = "unknown";
let interval: ReturnType<typeof setInterval> | null = null;

async function ping(): Promise<void> {
  const url = getHealthUrl();
  const start = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ms = Date.now() - start;
    if (lastState !== "up") {
      console.log(`✓ Backend reachable at ${url} (${ms}ms)`);
      lastState = "up";
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (lastState !== "down") {
      console.warn(`✗ Backend unreachable at ${url}: ${reason}`);
      lastState = "down";
    }
  }
}

export async function register(): Promise<void> {
  // Only run on the Node.js server runtime, not in the edge runtime or the
  // browser bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await ping();
  if (interval) clearInterval(interval);
  interval = setInterval(ping, PING_INTERVAL_MS);
}
