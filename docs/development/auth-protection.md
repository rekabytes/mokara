# Registration and login abuse protection

This phase adds rate limits and signup Turnstile verification. It reduces automated account creation and password guessing; it does not enforce one account per person. Email verification and account recovery are separate work.

## Limits

All replicas use Redis counters with atomic increment/expiry and fixed windows:

| Scope                              | Attempts | Window     |
| ---------------------------------- | -------- | ---------- |
| Registration per client IP/network | 5        | 1 hour     |
| Login per client IP/network        | 60       | 10 minutes |
| Login per username across all IPs  | 10       | 10 minutes |
| Password changes per account       | 10       | 10 minutes |

Attempts include successful requests, failed verification and invalid input. The IP limit runs before validation, provider calls, password hashing or database reads. The account limit runs after username validation and before account lookup/password verification. Limits expire automatically; blocked requests do not extend the window and no permanent account lock is created. IPv6 clients share a /64 bucket; IPv4-mapped socket addresses share their native IPv4 bucket. IP/user identities are HMAC-derived in Redis keys with bounded retention, rather than stored verbatim there.

Exhausted quotas return `429`, `Retry-After` in seconds and the normal API error shape. Redis failure returns `503`, allowing neither registration nor login to bypass enforcement. This is intentionally conservative: an attacker can temporarily exhaust a known username's quota, so these initial thresholds need observation and tuning for the real audience. There is no one-account-per-IP rule.

## Password requirements and compatibility

New passwords for registration and Settings use the same rule: at least eight
Unicode code points and no more than 72 UTF-8 bytes. The minimum was previously
checked as JavaScript string length (UTF-16 code units); new passwords now count
Unicode code points consistently in both runtimes. There are no new composition
rules. Spaces and combining sequences are retained exactly, with no trimming,
normalization or silent truncation. Symbols and emoji can consume several bytes;
72 ASCII characters, 36 `é` characters or 18 four-byte emoji reach the byte cap.

The byte ceiling comes from the installed bcrypt implementation. Its upstream
[security notes](https://github.com/dcodeIO/bcrypt.js#security-considerations)
explain that inputs over 72 bytes otherwise truncate silently. Both server schemas
reject those new passwords before hashing or account writes, and `hashPassword`
checks the policy again for non-route callers. Signup and Settings share one
browser helper for guidance and early validation; parity tests compare its
boundaries and messages with the separate backend policy module. No new shared
workspace package or browser import of backend code is needed.

Existing hashes are not migrated. Login and current-password verification retain
the old bcrypt comparison behavior and accept existing nonempty passwords,
including older short/over-limit inputs. The login form no longer applies the
new-password minimum to existing credentials. Users can sign in and choose a
replacement under the new policy. Existing over-limit hashes retain bcrypt's
legacy truncation behavior until the password is changed; this update cannot
recover ignored bytes from historical hashes. Social-only accounts are unchanged.

Deploy matching backend and frontend. No migration, environment variable or
forced password reset is needed. Verify signup and Settings at the 72-byte
boundary, multi-byte input rejection and legacy sign-in after deployment.

## Password changes in Settings

`POST /api/auth/password` requires a valid session and validated input before
consuming a separate account-wide allowance of 10 attempts per 10 minutes.
The bucket uses the verified user ID, not a submitted username, session ID or
IP address. Changing devices, signing in again or using another replica cannot
reset it. Other accounts and normal sign-in have separate allowances.

Every validated attempt counts, including successful changes and attempts by
social-only accounts. Invalid input and unauthenticated requests do not consume
this allowance. The limiter runs before the user lookup, current-password
verification and new-password hashing. The eleventh attempt returns the standard
`auth_rate_limited` envelope with status 429, a safe wait message and the actual
remaining TTL in `Retry-After`. Repeated blocked requests do not extend the
window. Settings already displays this through its unified error handler.

If Redis or its counter response is unavailable, fail closed with 503 before
password verification or modification; no replacement session is issued. The
existing session-validity guard runs first and can independently return 503.
Wrong current passwords, social-only accounts and successful changes keep their
existing response contracts. A successful change retains the existing session
revocation floor and replacement cookie behavior. This change does not revise
that floor's timestamp granularity or add password recovery/MFA.

No new environment variables, dependencies or migrations are needed. Deploy the
backend after merging. Check Settings with a wrong password, repeated attempts,
a correct change and a second account; confirm the retry message does not sign
the user out and normal sign-in remains usable during the cooldown.

## Trusted client IPs behind Next.js

By default the backend uses its actual TCP socket peer and ignores forwarded IP headers. With the Next proxy this means shared quotas for requests from that frontend server. To give visitors distinct quotas:

1. Configure a trusted ingress that overwrites a **single** client-IP header. Allow frontend traffic only through that ingress; block direct access to the frontend origin. Use `cf-connecting-ip` for a protected Cloudflare ingress, or `x-real-ip` for a reverse proxy that overwrites it from a verified client address. Do not blindly copy user input or trust arbitrary forwarded chains.
2. Generate a random secret of at least 32 characters (`openssl rand -base64 48`). Set `AUTH_PROXY_SECRET` to the same value on the backend and frontend runtime environments.
3. Set frontend `AUTH_CLIENT_IP_HEADER` to the ingress header selected above. Leave backend services on the private network rather than exposing their ports publicly.

Next strips incoming Mokara assertions and signs the verified ingress address and timestamp with HMAC-SHA256 for login/signup. The backend accepts only valid signatures within 60 seconds. Forged, stale or missing assertions fall back to the actual socket peer; they never select an arbitrary forwarded-IP bucket. Partial frontend configuration or a missing/invalid ingress IP returns `503`. Invalid short backend secrets fail environment validation. Keep server clocks synchronized. Secrets are runtime-only and must never be prefixed `NEXT_PUBLIC_`.

The signature authenticates the frontend assertion; it cannot make an untrusted ingress trustworthy. A directly reachable frontend with an attacker-controlled `x-real-ip` or `cf-connecting-ip` would defeat distinct-client limits. Confirm ingress isolation before enabling this configuration. Without it, retain the conservative shared quota.

## Turnstile deployment

Configure these **backend runtime** variables; no image-specific public build variables are needed:

- `TURNSTILE_SITE_KEY`: public widget site key.
- `TURNSTILE_SECRET_KEY`: private Siteverify key.
- `TURNSTILE_HOSTNAMES`: exact comma-separated frontend hostnames, for example `mokara.example.com,staging.mokara.example.com` (no scheme, port, path or wildcard).

In Cloudflare, create a Managed Turnstile widget with the corresponding allowed hostnames. Keep pre-clearance disabled; this integration does not use a Cloudflare clearance cookie. Use separate real widget credentials for production; Cloudflare's test keys are only for local/test environments.

Hosted production (`ENV=production`, `DEPLOY_MODE=hosted`) always requires complete Turnstile configuration. Missing configuration or published dummy credentials block signup with `503` while existing users can still log in. Development/self-hosted deployments omit Turnstile only when all three values are empty; any partial configuration blocks signup. Manual local success testing needs a real development widget with allowed local hostnames. Cloudflare dummy responses use action `test` and intentionally fail this integration's strict `signup` action check; use the isolated provider doubles for automated success cases. Never put private provider keys in source control.

The signup form requests public configuration from `/api/auth/signup-protection` with caching disabled. It loads Cloudflare only when required, renders an explicit flexible-width light widget with action `signup`, and disables submission until verification completes. Expired/error tokens are cleared; failed submissions remount verification because tokens are single-use. A retry control handles configuration/network/widget failures.

The backend verifies the token before hashing passwords or creating rows, with a five-second timeout. It checks provider success, exact hostname allowlist and action `signup`; rejects missing, expired, replayed or mismatched tokens; and fails closed on provider outages, malformed replies and configuration errors. No token, secret or raw verification response is logged. CSP allows only `https://challenges.cloudflare.com` as the additional script/frame origin.

## Validation and rollout

Run the isolated tests with:

```sh
node --import tsx --experimental-test-module-mocks --test packages/backend/test/auth-protection.test.mjs
```

These use fake Redis/DB/provider boundaries without running services. Typecheck and lint both packages and format changed files. The owner starts servers; do not probe live APIs or create test accounts as a side effect.

Before public rollout, configure credentials and trusted ingress, then manually check registration success, expiry/retry, rate-limit responses, login and browser CSP with Cloudflare. Redis atomicity relies on its Lua execution guarantees; unit doubles do not substitute for deployment acceptance. The abuse-protection changes alone need no database migration; Google/GitHub sign-in below adds one. Update the public privacy/cookie notice to describe the configured security provider.

Provider reference: [Cloudflare server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) and [client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).

## Google and GitHub sign-in

Social sign-in uses Mokara's existing session cookies, revocation and device list.
No Better Auth dependency was added. Username/password login remains available.
Google sign-in works with Google accounts, including Gmail and Workspace.

Configure **backend runtime** environment variables (never `NEXT_PUBLIC_*`):

```dotenv
AUTH_PUBLIC_URL=https://your-mokara-host.example
GOOGLE_AUTH_CLIENT_ID=...
GOOGLE_AUTH_CLIENT_SECRET=...
GITHUB_AUTH_CLIENT_ID=...
GITHUB_AUTH_CLIENT_SECRET=...
```

Each provider is enabled only when its two credentials and a valid public origin
are present. `AUTH_PUBLIC_URL` is the browser-facing frontend origin, with no
path, query or credentials; production requires HTTPS. Keep frontend/backend
`ENV` consistent so cookie names and Secure flags agree. Changing these values
requires restarting the backend, not rebuilding the frontend. Existing abuse
protection/Turnstile configuration above also applies to social registration.

### Google

In Google Cloud's Google Auth Platform, configure Branding, Audience and Data
Access for your project. Create an OAuth client of type **Web application**.
Request only `openid`, `email`, `profile`; no Gmail API or mailbox access is used.
Add the exact authorized redirect URI:

`https://your-mokara-host.example/api/auth/social/google/callback`

Copy the client ID/secret to the backend environment. If the app is in Testing,
add test users; configure the production audience/publishing requirements in the
Google console before opening sign-in to everyone. For local development, add
`http://localhost:4701/api/auth/social/google/callback` and set `AUTH_PUBLIC_URL`
to `http://localhost:4701` with development ENV.

Reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

### GitHub

Create a separate **OAuth App** under GitHub Settings → Developer settings →
OAuth Apps. Set Homepage URL to the frontend origin and Authorization callback
URL to:

`https://your-mokara-host.example/api/auth/social/github/callback`

Generate a client secret and copy the client ID/secret to the backend variables
above. Use a separate OAuth App for local development/staging because GitHub
OAuth Apps have one callback configuration. Local callback:
`http://localhost:4701/api/auth/social/github/callback`.

Do not replace `GITHUB_APP_*` values: those belong to repository integration.
Signing in with GitHub does not install the repository App or activate repos.
Scopes are `read:user user:email`, with a verified email required. Authorization
uses PKCE S256, supported by GitHub.com; this implementation targets GitHub.com,
not GitHub Enterprise Server.

Reference: [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

### Migration, behavior and verification

Deploy migration `20261011120000_social_login` before running the updated backend
(the existing bootstrap/deployment migration flow applies). It adds identity
records with unique provider IDs and permits users without a password. It does
not change existing password hashes or existing accounts. Regenerate Prisma
with the normal dependency/bootstrap flow.

Existing users should sign in with their password, then connect Google/GitHub in
**Settings → Sign-in methods**. Emails and GitHub handles never silently merge
accounts. A provider identity can belong to only one Mokara user; one user can
connect one identity per provider. A new social user completes the same signup verification/limits before any account
or Personal workspace is created. The server assigns a random temporary username
and takes the display name from the verified provider profile. The user can claim
a preferred username once in Settings; uniqueness and conditional claim writes
prevent conflicts or concurrent reclaims. Existing chosen usernames stay claimed.
Deploy migration `20261011150000_username_claim` with this change. Social-only accounts do not have a password
change form; password creation/recovery and unlinking are outside this change.
Provider email is a verified snapshot, not a recovery email or proof that two
Mokara accounts should be merged. Social login does not guarantee one account
per person: someone can own multiple Google/GitHub identities.

State is browser-bound, one-use and retained in Redis for ten minutes; linking
is bound to the originating user and session ID. Google additionally verifies
OIDC signature, issuer, audience, expiry, nonce and verified email. Provider
tokens are used only during callback processing, never persisted. Temporary
HttpOnly cookies and unfinished registration profiles expire after ten minutes.
Origin checks protect start/completion POSTs; redirects accept only client
paths. Redis/provider failures fail closed. New account/workspace creation is
transactional; provider uniqueness and a short owned Redis lease prevent racing
registrations. If an infrastructure failure occurs after the transaction commits,
start provider sign-in again to access the account already created.

Isolated tests use fake Redis/database/provider responses and local signing keys.
After configuring credentials and deploying the migration, manually verify both
providers: new-user completion, returning login, Settings linking, cancellation,
expired callbacks, username conflicts and sign-out/revocation. This live provider
check requires the operator's provider accounts and is not replaced by mocks.

## Live-update access

The authenticated SSE endpoint carries verified session claims from middleware.
Before each event and heartbeat it reads current account/workspace membership
from Postgres and rechecks Redis session revocation. No membership or revocation
cache grants ongoing access. Removal from a subscribed workspace closes the
stream; the existing EventSource reconnect path subscribes to current workspaces
and lets consumers refetch missed updates. New memberships are still picked up
on reconnect.

Idle streams revalidate every 25 seconds. Token expiry has a separate deadline
timer. Database/Redis check failures, subscriber disconnects and aborted clients
close the stream and release subscriptions/timers. Work waiting behind a slow
reader is serialized and capped at 32 pending frames; overload closes the stream
for reconnection rather than growing the backlog. Already transmitted frames
cannot be recalled. Responses use `Cache-Control: private, no-store`.

This extends the existing session denylist and issued-at floor rules; it does not
change token issuance or general session revocation semantics. No migration or
new environment variable is needed. `test:auth` includes isolated real-Hono SSE
tests with mocked storage and controlled timers. Live acceptance: keep a member's
tab open, remove their membership, then update a task in that workspace; verify
no further workspace updates arrive. Also test remote device sign-out, token
expiry and reconnection for a still-authorized member.
