# PRD-08 — Account Settings: Password, Profile and Devices

## 1. Goal

Close the last session-recovery gap and give accounts a real home: today a
user who suspects a stolen session has no lever at all (they cannot even change
their password). This PRD adds a `/settings` page with four abilities, built on
the Redis revocation machinery shipped in `a73cda2`:

1. **Change password** — verifies the current password, updates the hash, and
   **signs out every other device**. The current device stays signed in (the
   handler re-issues a fresh token).
2. **Sign out everywhere** — invalidates every session the user has anywhere,
   including the current one, then returns to `/login`.
3. **Devices list** — every live session with a coarse device label ("Chrome on
   macOS"), when it was added, when it was last seen, and a per-row logout
   (revoking the current row acts as a logout).
4. **Display name** — editable on the same page (username stays read-only);
   `PATCH /me` pushes the save into the session atom.

## 2. Non-goals

- **Self-service account deletion** — privacy §11.1 promises deletion _on
  request_; self-service needs team-ownership transfer rules and a
  cascade/erasure decision (PDPA + GDPR). Parked as its own future PRD.
- Raw user-agent / IP / device-identifier storage. The registry keeps a lossy
  label only — the Privacy Policy §3.4 is reworded to match (see §6).
- Email/username changes. Mokara has no email concept; usernames are identity.

## 3. The revocation floor and the session registry

Two Redis structures per user complete the model in `lib/sessions.ts`:

    mokara:user:<id>:minIat  = <unix seconds, no TTL>   (the floor)
    mokara:user:<id>:jtis    = <set of live jtis>       (the registry index)
    mokara:sess:<jti>        = { ua, iat, exp, seen } JSON, TTL = remaining life

Every authed request already checks the per-session denylist
(`mokara:revoked:<jti>`). It also checks the floor: a token whose `iat` is
older than the user's floor is rejected exactly like a denylisted one. "Sign
out everywhere" and "change password" both just bump the floor forward (and
wipe the registry set) — no enumeration of live tokens is ever needed.

The registry is bookkeeping, not security: the middleware tracks sessions
_after_ the validity check passes, and a tracking failure is logged and
swallowed — a metadata write must never take a request down the way a security
check can. Last-seen writes are throttled to one per minute per session;
records whose token died naturally are removed from the set lazily at list
time; the stored label is a lossy "Browser on OS" pair — never the raw header.

## 4. Endpoints

| Method & path                   | Body                                                                    | Success                                                                | Errors                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/password`       | `{ current_password, new_password }` (strict; `passwordSchema` = min 8) | 204, **new session cookie set**                                        | 401 `not_authenticated` · 401 `incorrect_password` (new code) · 400 `invalid_input` · 500 `lookup_failed` / `internal_error` |
| `POST /api/auth/revoke-all`     | —                                                                       | 204, **cookie cleared**                                                | 401 `not_authenticated` · 500                                                                                                |
| `GET /api/auth/sessions`        | —                                                                       | `{ sessions: [{ id, device, created_at, last_seen_at, current }] }`    | 401 · 500                                                                                                                    |
| `DELETE /api/auth/sessions/:id` | —                                                                       | 204 (idempotent: unknown/expired ids are simply "not live afterwards") | 401 · 404 (missing id segment)                                                                                               |
| `PATCH /api/me`                 | `{ display_name: string \| null }` (null clears)                        | `{ user }`                                                             | 401 · 400 `invalid_input`                                                                                                    |

`incorrect_password` is a distinct code so the settings form can say "that's
not your current password" inline — `invalid_credentials` copy is
username-or-password specific. The three `/api/auth` routes mount on the
public sub-app with per-route `authRequired` (login/signup live there too);
`PATCH /me` rides the authed surface beside `GET /me` in `index.ts`,
delegating to an `updateMe()` data helper — a standalone exported Context
parameter cannot carry Hono's validated-json type, which is why that validator
stays inline.

## 5. Frontend

- **`/settings`** (`app/(app)/settings/page.tsx`, client) — the verbatim
  breadcrumb header (star + size-8 bell included), then a single narrow column
  with three analytics-style cards: **Account** (read-only username, editable
  display name), **Security** (password form) and **Devices** (the registry:
  "This device" tag, added/active relative times, per-row logout,
  sign-out-everywhere footer). One shared `useAsyncError` channel; its banner
  sits above the cards so a failure is never rendered twice.
- **Entry point** — the sidebar's own avatar/handle row becomes the link to
  `/settings` (hover tint added; visuals otherwise unchanged).
- **Proxy guard** — `/settings` joins `PROTECTED_PREFIXES`.
- **State** — form fields are ephemeral `useState`; device revocations refresh
  the list; display-name saves call `setSessionUser(updated.user)` (the same
  path login uses). Revoking the current device runs the ordinary logout path
  and replaces to `/login`.

## 6. Decisions made (owner may veto)

- Deletion stays parked (§2); the device list and display name came in with
  the owner's go on the settings page.
- Password change keeps the current device signed in (GitHub behaviour). The
  separate button and the current row's logout sign out _everything_.
- The registry stores a lossy label only, never the raw User-Agent — the
  Privacy Policy's "no user-agent string" promise is preserved in spirit and
  reworded, not silently broken.
- Confirm-password field exists client-side only; the server takes two fields.
- The floor never expires and only moves forward; it is not decremented at
  login (a login never un-revokes older sessions).

## 7. Build order

1. `lib/ua.ts`; `lib/sessions.ts` registry + helpers; `jwt.ts` returns `iat`;
   middleware tracks valid sessions (swallow-on-failure).
2. `validation.ts` schemas; `/password`, `/revoke-all`, `/sessions` routes;
   `PATCH /me` in `index.ts`.
3. `lib/errors.ts` row, `lib/api.ts` methods, `session.ts` export, proxy
   prefix, AppShell link, the page itself; Privacy Policy §3.4.
4. Gates; PRD text reviewed against the implementation.
