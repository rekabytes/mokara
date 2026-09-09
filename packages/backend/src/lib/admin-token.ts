import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env.ts";

// The operator console's token, deliberately separate from lib/jwt.ts:
//
//   - different secret  (ADMIN_TOKEN_SECRET, shared with packages/admin's .env
//                        so BOTH sides can verify the same token)
//   - different subject (always the literal "admin" — there is exactly one
//                        operator identity, it is not a `users` row)
//   - different life    (8h, expiry-only: no denylist, no device registry. A
//                        single operator does not need "sign out everywhere",
//                        and the console writes nothing a stale token could
//                        abuse beyond what the operator can already do.)
//
// Every function here is only ever reached behind `adminConfigured`, so the
// secret is built lazily the way lib/billing.ts builds its Stripe client —
// an empty ADMIN_TOKEN_SECRET must never become a working signing key.

export const ADMIN_TOKEN_TTL_S = 8 * 60 * 60; // 8 hours

function adminSecret(): Uint8Array {
  return new TextEncoder().encode(env.ADMIN_TOKEN_SECRET);
}

export interface AdminClaims {
  /** Always "admin" — the console has one identity. */
  sub: "admin";
  /** Session id, for logs. Not revocation-checked (see above). */
  jti: string;
}

export async function issueAdminToken(): Promise<string> {
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TOKEN_TTL_S}s`)
    .sign(adminSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, adminSecret());
    if (payload.sub !== "admin" || typeof payload.jti !== "string") return null;
    return { sub: "admin", jti: payload.jti };
  } catch {
    return null;
  }
}

/**
 * Constant-time string compare for the env-held credentials and the login-URL
 * key. Hashing both sides first makes the compare length-independent, so a
 * wrong-length guess costs the same time as a right-length one — the same
 * oracle the audit found in the user login path (bcrypt skipped for unknown
 * users) must not be rebuilt here.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
