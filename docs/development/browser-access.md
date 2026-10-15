# Browser access protection

The backend accepts browser origins only from its configured `AUTH_PUBLIC_URL`
and optional comma-separated `CORS_ALLOWED_ORIGINS`. The canonical URL is the
browser-facing frontend origin already used for social sign-in/MCP OAuth; do not
replace it with the private backend URL. No new environment variable is added.
No origin is inferred from incoming Host, forwarded headers, Referer or Fetch
Metadata. Configuration entries must be exact HTTP(S) origins, optionally with a
trailing slash, without credentials, paths, queries or fragments. Request Origin
headers must use the browser's exact serialized origin (no trailing slash).

Empty `CORS_ALLOWED_ORIGINS` means no additional origins, not open access. Wildcard
configuration fails environment validation at startup. Invalid/missing
`AUTH_PUBLIC_URL` never grants trust; a valid explicit additional origin may still
be used. With both settings empty, browser writes are unavailable until configured.
For normal local development, use the frontend origin already in `.env.example`.

For general API requests, a present untrusted or opaque `Origin: null` is rejected
with403 `origin_forbidden`. POST, PUT, PATCH, DELETE and other unsafe methods also
require an explicit trusted Origin when it is missing. This runs in the outer
CORS middleware before body parsing, authentication or mutation handlers, so
simple form submissions are rejected too. Normal browser fetch writes supply
Origin, and Next's same-origin proxy preserves it. Non-browser callers using
cookie-based write endpoints must send the configured trusted Origin explicitly;
the header is an anti-CSRF boundary, not a replacement credential.

Trusted browser responses receive an exact Access-Control-Allow-Origin and
Allow-Credentials, Vary:Origin and preflight headers. Untrusted preflights are
rejected; originless safe requests get no permissive CORS headers. Retry-After
and X-Mokara-Next-Cursor are exposed to trusted browser clients. Originless GET
navigations, authenticated reads, SSE and OAuth provider callback navigations
remain possible. Every route still owns its normal authentication/authorization.
Safe-method routes must remain free of user-data mutations beyond the existing
state-bound sign-in redirect flows; this guard does not make GET mutations safe.

## Machine and OAuth boundaries

- `/api/mcp` retains its independent `MCP_ALLOWED_ORIGINS` policy and token auth.
  Native agents can omit Origin; browser MCP clients need their explicit list.
- OAuth discovery and exact register/token/revoke endpoints keep credentialless
  wildcard CORS for interoperable clients. They do not use browser session cookies
  for authorization. Cookie-based consent still requires its existing exact
  canonical-origin check as well as the outer guard.
- Exact GitHub/Stripe webhook paths can omit Origin and retain signature checks.
- `/api/admin` and its slash-delimited descendants can omit Origin because the
  admin server uses separate credentials/Bearer tokens, not user-cookie auth.
  Browser-origin requests to those paths still undergo origin checks. No broader
  prefix exemption or exemption based on a supplied Authorization header exists.

The originless exceptions do not bypass authentication, signatures, quotas or
route validation. The frontend proxy does not synthesize a trusted Origin for
untrusted/missing browser headers. CORS does not authenticate native clients;
CSRF protection also depends on keeping configured trusted sites trustworthy.
This change does not redesign operator-console browser/session protection.

## Deployment and acceptance

Before deploying the backend, verify `AUTH_PUBLIC_URL` matches that deployment's
actual frontend origin. Replace any `CORS_ALLOWED_ORIGINS=*` with exact trusted
origins or leave it empty when the canonical frontend is sufficient. For staging
and production, use their respective environment values; there is no hardcoded
host fallback. Restart with updated runtime settings. Deploy the frontend error
copy as well. No dependency or migration is required.

Verify password/social sign-in, task/comment/file writes, live updates, billing,
GitHub callbacks/webhooks, admin proxy and native MCP after deployment. An origin
configuration mismatch should show a safe inline error rather than a sign-out
loop. Tests cover the middleware in-process, environment validation with isolated
fixture settings, and frontend error normalization. Existing integration suites
continue to verify the separate machine authentication paths. No live requests or
owner credentials are needed for these checks.
