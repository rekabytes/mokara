import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Redis } from "@mokara/redis";
import { z } from "zod";

export const AUTH_LIMITS = {
  mcpOAuthPeer: { attempts: 120, seconds: 60 },
  mcpOAuthGlobal: { attempts: 1200, seconds: 60 },
  mcpRegister: { attempts: 100, seconds: 3600 },
  mcp: { attempts: 120, seconds: 60 },
  mcpIssue: { attempts: 10, seconds: 3600 },
  signup: { attempts: 5, seconds: 3600 },
  login: { attempts: 60, seconds: 600 },
  account: { attempts: 10, seconds: 600 },
  oauth: { attempts: 30, seconds: 600 },
};

// Increment and expiry are one operation, including concurrent requests from
// different replicas. Blocked attempts do not extend the fixed window.
const LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

export async function consumeAuthLimit(
  redis: Pick<Redis, "eval">,
  scope: keyof typeof AUTH_LIMITS,
  identity: string,
  secret: string
): Promise<number> {
  const limit = AUTH_LIMITS[scope];
  const digest = createHmac("sha256", secret).update(identity).digest("hex");
  const result = await redis.eval(
    LIMIT_SCRIPT,
    1,
    `mokara:auth-limit:${scope}:${digest}`,
    limit.seconds
  );
  const parsed = z
    .tuple([z.number().int().positive(), z.number().int().nonnegative()])
    .parse(result);
  return parsed[0] > limit.attempts ? Math.max(1, parsed[1]) : 0;
}

export function normalizeIp(address: string): string | null {
  const value = address.trim().toLowerCase();
  if (isIP(value) === 4) return value;
  // IPv4-mapped socket addresses must share their native IPv4 bucket.
  if (value.startsWith("::ffff:") && isIP(value.slice(7)) === 4) return value.slice(7);
  if (isIP(value) !== 6 || value.includes("%")) return null;
  const normalized = new URL(`http://[${value}]`).hostname.slice(1, -1);
  if (normalized.startsWith("::ffff:")) {
    const parts = normalized.slice(7).split(":");
    if (parts.length === 2) {
      const high = Number.parseInt(parts[0] ?? "", 16);
      const low = Number.parseInt(parts[1] ?? "", 16);
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
  }
  return normalized;
}

export function ipBucket(address: string): string {
  if (isIP(address) !== 6) return address;
  // Group IPv6 privacy addresses in a /64 instead of granting a fresh quota
  // for every interface identifier on the same network.
  const [left, right] = address.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const groups =
    right === undefined
      ? head
      : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  return (
    groups
      .slice(0, 4)
      .map((part) => part.padStart(4, "0"))
      .join(":") + "::/64"
  );
}

/** Only the Next server can assert an edge-provided IP; browser headers alone
 * are never trusted. Without an assertion, use the actual socket peer. */
export function authClientIp(
  headers: Headers,
  peer: string | undefined,
  proxySecret: string,
  now = Date.now()
): string {
  const address = headers.get("x-mokara-client-ip") ?? "";
  const timestamp = headers.get("x-mokara-client-time") ?? "";
  const signature = headers.get("x-mokara-client-signature") ?? "";
  if (
    proxySecret.length >= 32 &&
    /^\d{13}$/.test(timestamp) &&
    Math.abs(now - Number(timestamp)) <= 60_000 &&
    /^[a-f0-9]{64}$/.test(signature)
  ) {
    const expected = createHmac("sha256", proxySecret).update(`${timestamp}\n${address}`).digest();
    const normalized = normalizeIp(address);
    if (normalized && timingSafeEqual(expected, Buffer.from(signature, "hex"))) return normalized;
  }
  return normalizeIp(peer ?? "") ?? "unknown-peer";
}

type TurnstileSettings = {
  ENV: "development" | "production";
  DEPLOY_MODE: "hosted" | "self_hosted";
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_HOSTNAMES: string;
};

export function signupProtection(settings: TurnstileSettings) {
  const hostnames = settings.TURNSTILE_HOSTNAMES.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const required =
    (settings.ENV === "production" && settings.DEPLOY_MODE === "hosted") ||
    Boolean(settings.TURNSTILE_SITE_KEY || settings.TURNSTILE_SECRET_KEY || hostnames.length);
  // Cloudflare's published dummy credentials must never enable production
  // registration. They deliberately provide predictable verification results.
  const dummyKey = /^[123]x0{20,}A[AB]$|^[12]x0{20,}BB$|^3x0{20,}FF$/;
  const productionDummy =
    settings.ENV === "production" &&
    [settings.TURNSTILE_SITE_KEY, settings.TURNSTILE_SECRET_KEY].some((key) => dummyKey.test(key));
  const configured =
    !productionDummy &&
    Boolean(settings.TURNSTILE_SITE_KEY && settings.TURNSTILE_SECRET_KEY && hostnames.length);
  return { required, configured, hostnames, siteKey: settings.TURNSTILE_SITE_KEY };
}

const VerificationSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export async function verifySignupChallenge(
  token: string | undefined,
  settings: TurnstileSettings,
  fetcher: typeof fetch = fetch
): Promise<"ok" | "invalid" | "unavailable"> {
  const protection = signupProtection(settings);
  if (!protection.required) return "ok";
  if (!protection.configured) return "unavailable";
  if (!token || token.length > 2048) return "invalid";
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: settings.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unavailable";
    const parsed = VerificationSchema.safeParse(await response.json());
    if (!parsed.success) return "unavailable";
    const result = parsed.data;
    if (!result.success) {
      const configurationErrors = [
        "missing-input-secret",
        "invalid-input-secret",
        "internal-error",
      ];
      return result["error-codes"]?.some((code) => configurationErrors.includes(code))
        ? "unavailable"
        : "invalid";
    }
    return result.action === "signup" &&
      protection.hostnames.includes(result.hostname?.toLowerCase() ?? "")
      ? "ok"
      : "invalid";
  } catch {
    return "unavailable";
  }
}
