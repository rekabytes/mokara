import type { Context, Next } from "hono";
import { adminConfigured } from "../env.ts";
import { verifyAdminToken } from "../lib/admin-token.ts";

// The console's gate. Two deliberate differences from middleware/auth.ts:
//
//   1. The token travels in `Authorization: Bearer …`, not a cookie. The
//      browser never talks to this API directly — packages/admin proxies every
//      call and attaches the header server-side — so there is no cookie to
//      read, and no CSRF surface for these routes.
//   2. "Not configured" answers 404, not 409. Billing says
//      `billing_not_configured` because a self-hoster is *expected* to see the
//      settings tile explain itself; an admin console that does not exist
//      should not announce that it could.
//
// No Redis here on purpose: an 8h expiry is the whole revocation story for a
// single operator (see lib/admin-token.ts).
export async function adminRequired(c: Context, next: Next): Promise<Response | void> {
  if (!adminConfigured) {
    return c.json({ error: "not_found", message: "not found" }, 404);
  }
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const claims = token === "" ? null : await verifyAdminToken(token);
  if (claims === null) {
    return c.json({ error: "admin_unauthorized", message: "admin login required" }, 401);
  }
  await next();
}
