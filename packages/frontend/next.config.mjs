import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

// --- Security response headers ---------------------------------------------
// Applied to every route below. The CSP is deliberately conservative and
// enforced (not report-only). Turnstile is the only allowed third-party
// script/frame origin; fonts and app assets remain same-origin.
const isProdBuild = process.env.NODE_ENV === "production";

// Next's inline hydration/bootstrap scripts require 'unsafe-inline'; dev's
// Turbopack HMR additionally requires 'unsafe-eval'. The nonce-based
// 'strict-dynamic' upgrade that removes 'unsafe-inline' is the follow-up.
// style-src 'unsafe-inline' is load-bearing: framer-motion writes inline
// style attributes, which CSP gates behind style-src.
const csp = [
  "default-src 'self'",
  isProdBuild
    ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://makakami.com.my/badge/mokara.svg https://api.producthunt.com/widgets/embed-image/v1/featured.svg",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy companion to CSP frame-ancestors for older browsers.
  // Frame protection is set by proxy.ts; ticket forms use an exact site allowlist.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// HTTPS responses only, so this is skipped in dev (where the app runs over
// plain http and browsers would ignore it anyway). One year, deliberately
// without includeSubDomains (a self-hoster may run sibling services — e.g. an
// API — under the same hostname) and without preload (irreversible).
if (isProdBuild) {
  securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal self-contained server bundle: .next/standalone holds server.js plus
  // only the traced files, which is what makes a ~40 MB runtime image possible
  // instead of shipping node_modules and the build toolchain.
  output: "standalone",
  // Required in a pnpm workspace: without it the traced file list stops at the
  // package boundary and the standalone bundle cannot resolve workspace files.
  // projectRoot is the same value turbopack.root uses below.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/teams/:teamId/files/:id/preview",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'self'" },
        ],
      },
      {
        source: "/mcp/authorize",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
