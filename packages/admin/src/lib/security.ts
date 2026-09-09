import type { Context, Next } from "hono";

// The console's headers. Tighter than the product frontend's on purpose: there
// is no third-party anything here, no inline script and no inline style (the
// CSS and JS ship as files), so the CSP can stay fully closed.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export async function securityHeaders(c: Context, next: Next): Promise<void> {
  c.header("content-security-policy", CSP);
  c.header("x-frame-options", "DENY");
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
  // An operator console must never be indexed, and the login URL carries a
  // secret — no crawler, no archive, no snippet.
  c.header("x-robots-tag", "noindex, nofollow, noarchive");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
  // Operator data, and a stale admin.js after a deploy is its own kind of bug.
  c.header("cache-control", "no-store");
  await next();
}
