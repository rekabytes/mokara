# PRD-08 — Account Settings: Password Change + Sign Out Everywhere

## 1. Goal

Close the last session-recovery gap: today a user who suspects a stolen session
has no lever at all (they cannot even change their password). This PRD adds a
`/settings` page with two abilities, both built on the Redis revocation
machinery shipped in PRD-07's aftermath (`a73cda2`):

1. **Change password** — verifies the current password, updates the hash, and
   **signs out every other device**. The current device stays signed in (the
   handler re-issues a fresh token).
2. **Sign out everywhere** — invalidates every session the user has anywhere,
   including the current one, then returns to `/login`.

## 2. Non-goals

- **Self-service account deletion** — privacy §11.1 promises deletion _on
  request_; self-service needs team-ownership transfer rules and a
  cascade/erasure decision (PDPA + GDPR). Parked as its own future PRD.
- **Session list UI** ("these are your active devices") — needs per-session
  metadata tracking (UA, last-seen). The floor mechanism makes it _possible_
  later; it is not built now.
- Email/username changes. Mokara has no email concept; usernames are identity.

## 3. The revocation floor

One new Redis key per user completes the model in `lib/sessions.ts`:

    mokara:user:<id>:minIat  = <unix seconds, no TTL>

Every authed request already checks the per-session denylist
(`mokara:revoked:<jti>`). It now also checks the floor: a token whose `iat` is
older than the user's floor is rejected exactly like a denylisted one. "Sign
out everywhere" and "change password" both just bump the floor forward — no
enumeration of live tokens is ever needed, and keys hold only numbers, so
nothing personal is stored.

Failure directions (deliberate):

| Step order (password change)                                            | If it fails midway                                                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| verify current password → **bump floor** → update hash → re-issue token | Floor bumped, password unchanged, all sessions dead → user logs in again with the old password. _Safe direction._ The other order would leave old sessions alive under a new password. |

Redis being down entirely is already covered: the middleware fails closed
(503), so no request reaches these handlers during an outage.

## 4. Endpoints

Both mount on the existing `/api/auth` sub-app with **per-route
`authRequired`** (the sub-app itself stays public; login/signup live there).

| Method & path               | Body                                                                    | Success                         | Errors                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/password`   | `{ current_password, new_password }` (strict; `passwordSchema` = min 8) | 204, **new session cookie set** | 401 `not_authenticated` · 401 `incorrect_password` (new code) · 400 `invalid_input` · 500 `lookup_failed` / `internal_error` |
| `POST /api/auth/revoke-all` | —                                                                       | 204, **cookie cleared**         | 401 `not_authenticated` · 500                                                                                                |

`incorrect_password` is a distinct code so the settings form can say "that's
not your current password" inline — `invalid_credentials` copy is
username-or-password specific.

## 5. Frontend

- **`/settings`** (`app/(app)/settings/page.tsx`, client) — the verbatim
  breadcrumb header (star + size-8 bell included), then a single narrow column
  with two cards matching the analytics section-card look.
- **Entry point** — the sidebar's own avatar/handle row becomes the link to
  `/settings` (hover tint added; visuals otherwise unchanged).
- **Proxy guard** — `/settings` joins `PROTECTED_PREFIXES`.
- **State** — form fields are ephemeral `useState`; API failures flow through
  `useAsyncError` → `ErrorBanner`; client-side confirm-mismatch uses
  `manualError` (the documented client-validation shape). Password change
  success shows a confirmation line and clears the fields; the session atom
  needs no update (same user, new token).
- **After revoke-all** — the shared atom is cleared via a new exported
  `forgetSessionUser()` and the page replaces to `/login`.

## 6. Decisions made (owner may veto)

- Scope is password change + sign-out everywhere; deletion is parked (§2).
- Confirm-password field exists client-side only; the server takes two fields.
- Password change keeps the current device signed in (GitHub behaviour). The
  separate button signs out _everything_ including this device.
- The floor never expires and only moves forward; it is not decremented at
  login (a login never un-revokes older sessions).

## 7. Build order

1. `lib/sessions.ts` floor helpers + pipelined-free validity check; `jwt.ts`
   returns `iat`; middleware swaps to `isSessionValid`.
2. `validation.ts` schema; `/password` + `/revoke-all` routes.
3. `lib/errors.ts` row, `lib/api.ts` methods, `session.ts` export, proxy
   prefix, AppShell link, the page itself.
4. Gates; PRD text reviewed against the implementation.
