import { createRedis, type Redis } from "@mokara/redis";
import { env } from "./env.ts";
import { log } from "./lib/logger.ts";

let client: Redis | null = null;

// The connected client. Throws before startup completes or after shutdown, so
// a wiring mistake surfaces as a loud error rather than a silent no-op.
export function getRedis(): Redis {
  if (!client) throw new Error("Redis is not connected — connectRedis() must run first");
  return client;
}

// Pings Redis and logs the result. Throws on failure so the caller can fail
// fast at startup, exactly like connectDB() does for Postgres.
export async function connectRedis(): Promise<void> {
  const redis = createRedis(env.REDIS_URL);
  // ioredis emits "error" on every dropped connection; with no listener Node
  // treats that as an unhandled error and kills the process. The client
  // reconnects on its own (retryStrategy) — this only records what happened.
  redis.on("error", (err: Error) => {
    log.error("Redis connection error", err);
  });
  try {
    await redis.connect();
    await redis.ping();
  } catch (e) {
    log.error("Could not connect to Redis", e);
    throw e;
  }
  client = redis;
  log.ok("Connected to Redis");
}

export async function disconnectRedis(): Promise<void> {
  const redis = client;
  client = null;
  if (redis) await redis.quit();
}
