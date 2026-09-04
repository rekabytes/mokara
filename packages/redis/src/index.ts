import { Redis } from "ioredis";

export type { Redis };

// Tuned for the backend's fail-closed auth posture: commands never queue up
// while the connection is down — they reject immediately, so the auth
// middleware answers 503 instead of hanging on every request. Reconnects keep
// running in the background with a capped backoff, and a recovered Redis
// resumes serving without a process restart.
const CONNECT_TIMEOUT_MS = 3_000;
const RECONNECT_STEP_MS = 1_000;
const RECONNECT_MAX_MS = 5_000;

export function createRedis(url: string): Redis {
  return new Redis(url, {
    // The caller (backend's connectRedis) drives the first connection itself
    // so startup can fail fast, exactly like connectDB does for Postgres.
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => Math.min(times * RECONNECT_STEP_MS, RECONNECT_MAX_MS),
  });
}
