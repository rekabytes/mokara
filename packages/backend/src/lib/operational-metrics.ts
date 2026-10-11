import { z } from "zod";
import { getRedis } from "../redis.ts";
import { log } from "./logger.ts";

const PREFIX = "mokara:ops:minute:";
const RETENTION_SECONDS = 2 * 60 * 60;
const WINDOW_MINUTES = 60;
let lastWarningAt = 0;
const bucket = (at: number) => `${PREFIX}${Math.floor(at / 60_000)}`;
const counters = z.record(z.string(), z.string());

export function safeMetricCode(code: unknown): string {
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(code) ? code : "unknown_error";
}

/** Aggregate only. Never record paths, query strings, identities or bodies. */
export async function recordOperationalRequest(
  status: number,
  code: unknown,
  billingWebhook: boolean,
  at = Date.now()
): Promise<void> {
  try {
    const key = bucket(at);
    const transaction = getRedis().multi().hincrby(key, "requests", 1);
    if (status >= 500) transaction.hincrby(key, "server_errors", 1);
    if (status >= 400) transaction.hincrby(key, `error:${safeMetricCode(code)}`, 1);
    if (billingWebhook)
      transaction.hincrby(key, status >= 400 ? "billing_failed" : "billing_received", 1);
    transaction.expire(key, RETENTION_SECONDS);
    const result = await transaction.exec();
    if (!result || result.some(([error]) => error !== null))
      throw new Error("Metric counters unavailable");
  } catch {
    // Telemetry failure must not fail a product request or log credential data.
    if (Date.now() - lastWarningAt > 60_000) {
      lastWarningAt = Date.now();
      log.warn("Operational counters unavailable; request remains unaffected");
    }
  }
}

export function summarizeCounters(rows: Record<string, string>[]) {
  let requests = 0,
    serverErrors = 0,
    billingFailed = 0,
    billingReceived = 0;
  const errors = new Map<string, number>();
  for (const row of rows) {
    const number = (key: string) => {
      const value = Number(row[key] ?? 0);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    requests += number("requests");
    serverErrors += number("server_errors");
    billingFailed += number("billing_failed");
    billingReceived += number("billing_received");
    for (const key of Object.keys(row))
      if (key.startsWith("error:")) {
        const code = safeMetricCode(key.slice(6));
        errors.set(code, (errors.get(code) ?? 0) + number(key));
      }
  }
  return {
    requests,
    server_errors: serverErrors,
    billing_failed: billingFailed,
    billing_received: billingReceived,
    errors: [...errors]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

export async function readOperationalMetrics(at = Date.now()) {
  const pipeline = getRedis().pipeline();
  for (let minute = 0; minute < WINDOW_MINUTES; minute++)
    pipeline.hgetall(bucket(at - minute * 60_000));
  const result = await pipeline.exec();
  if (!result) throw new Error("Operational counters unavailable");
  const rows = result.map(([error, value]) => {
    if (error) throw new Error("Operational counters unavailable");
    const parsed = counters.safeParse(value);
    if (!parsed.success) throw new Error("Operational counters unavailable");
    return parsed.data;
  });
  return { window_minutes: WINDOW_MINUTES, ...summarizeCounters(rows) };
}
