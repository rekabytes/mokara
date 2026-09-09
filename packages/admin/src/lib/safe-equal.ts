import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare for the login-URL key.
 *
 * Deliberately a copy of the backend's helper in lib/admin-token.ts rather than
 * a shared package: the two services deploy independently, and six lines of
 * node:crypto are not worth a workspace dependency between them. Hashing both
 * sides first makes the compare length-independent, so a wrong-length guess
 * costs the same time as a right-length one.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
