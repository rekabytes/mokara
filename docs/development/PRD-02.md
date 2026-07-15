# PRD-02: Auth + Teams (v2)

**Status:** Planned
**Owner:** TBD
**Depends on:** PRD-01 (basic tasks, monorepo, Prisma schema)
**Last updated:** 2026-07-15

---

## 1. Overview

v2 layers **authentication** and **lightweight teams** on top of PRD-01. Every
user creates an account with a **username + password**, then either creates a
team or is invited to one by username. Tasks become team-scoped: a team owns a
shared task list that all members can read and write. Teams are intentionally
small (max 3 members) to keep collaboration intimate and prevent abuse in
development.

The auth model is local: JWTs signed by the Go backend with a shared secret,
delivered to the browser as an `httpOnly` cookie. No third-party OAuth
provider, no external IdP. This keeps v2 self-contained and easy to run
without provider credentials.

## 2. Goals

- Add **username + password auth** (bcrypt-hashed, JWT-issued session).
- Add **teams** with create, member list, leave, and ownership transfer.
- Add **invitations** by username (status: pending → accepted / declined /
  expired).
- Enforce a **hard cap of 3 members per team**.
- Move tasks under teams: every task has a `team_id`; only team members can
  read or write.
- Keep PRD-01 endpoints (`/api/tasks/*`) working — they just become
  team-scoped and authenticated.

## 3. Out of Scope (v2)

- Email/phone verification, password reset, MFA, account recovery.
- OAuth providers (Google, GitHub, Discord, etc.).
- Role-based permissions beyond a single `owner` / `member` distinction.
- Public / discoverable teams. Teams are invite-only.
- Real-time updates, push notifications, activity feed.
- Avatars, file uploads, rich profile pages.
- Team deletion (deferred to v3 — teams are soft-deleted by owner only if
  empty).

## 4. Core Features

| #   | Feature                  | Description                                                                                |
| --- | ------------------------ | ------------------------------------------------------------------------------------------ |
| F1  | Sign up                  | Create account with `username`, `password`, optional `display_name`.                       |
| F2  | Log in / log out         | Issue JWT cookie on success. Logout clears the cookie.                                     |
| F3  | Current user             | `GET /api/me` returns the authenticated user.                                              |
| F4  | Create team              | Authenticated user creates a team and is auto-added as `owner`.                            |
| F5  | List my teams            | `GET /api/teams` returns teams the current user is a member of.                            |
| F6  | View team detail         | `GET /api/teams/:id` returns team + members + open invitations (members only).             |
| F7  | Invite by username       | Owner/member invites another existing user by username. 3-member cap is enforced.           |
| F8  | List my pending invites  | `GET /api/invitations` returns invitations where `invitee_username = current`.            |
| F9  | Accept / decline invite  | On accept, the invitee is added to `team_members` (respects cap).                          |
| F10 | Leave team               | A non-owner member can leave. Owner cannot leave while other members exist.                |
| F11 | Team-scoped tasks        | `GET/POST /api/teams/:id/tasks` (list / create). `PATCH/DELETE /api/tasks/:id` requires membership. |
| F12 | Auto-expire invites      | Invitations expire 7 days after creation. Expired invites cannot be accepted.              |

## 5. Tech Stack (additions / changes vs PRD-01)

| Layer            | PRD-01                       | PRD-02                                                                                |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Auth             | —                            | `golang.org/x/crypto/bcrypt` (bundled with Go toolchain) + `github.com/golang-jwt/jwt/v5 v5.3.1` |
| Session transport | —                          | `httpOnly`, `SameSite=Lax`, `Secure` (in prod) cookie named `mokara_token`             |
| Schema           | 1 table (`tasks`)            | 5 tables: `users`, `teams`, `team_members`, `team_invitations`, `tasks` (now FK-bound) |
| Migrations       | 1 init migration             | Adds `20260715_auth_and_teams` migration                                               |
| Frontend         | `/` (task list)              | `/login`, `/signup`, `/`, `/teams`, `/teams/[id]`, `/invitations`                      |

### 5.1 Dependency versions (pinned)

Picked from the reference stack in mem0 (project `hmanlab-prox`):

| Package | Version | Why pinned |
| --- | --- | --- |
| `github.com/golang-jwt/jwt/v5` | **`v5.3.1`** | Matches the mem0 reference version exactly; v5 line is stable for HS256 + claims API we need. |
| `golang.org/x/crypto` | toolchain-pinned (no separate version) | Ships with the Go toolchain listed in `packages/backend/go.mod` (`go 1.26.0`, toolchain `go1.26.5`); we only use `bcrypt`. |

Frontend and database packages have **no new dependencies** for PRD-02.

## 6. Data Model

### `users`

| Column         | Type         | Constraints                  | Notes |
| -------------- | ------------ | ---------------------------- | ----- |
| `id`           | `uuid`       | PK, default `gen_random_uuid()` |  |
| `username`     | `text`       | NOT NULL, UNIQUE (citext)    | Case-insensitive; 3–20 chars, `[a-z0-9_]+` |
| `password_hash`| `text`       | NOT NULL                     | bcrypt cost ≥ 10 |
| `display_name` | `text`       | nullable                     |  |
| `created_at`   | `timestamptz`| NOT NULL, default `now()`    |  |
| `updated_at`   | `timestamptz`| NOT NULL, default `now()`    |  |

### `teams`

| Column       | Type         | Constraints                  | Notes |
| ------------ | ------------ | ---------------------------- | ----- |
| `id`         | `uuid`       | PK, default `gen_random_uuid()` |  |
| `name`       | `text`       | NOT NULL                     | 1–50 chars |
| `slug`       | `text`       | NOT NULL, UNIQUE             | Lowercase, hyphenated, derived from `name` |
| `owner_id`   | `uuid`       | NOT NULL, FK → `users(id)`   | Original creator |
| `created_at` | `timestamptz`| NOT NULL, default `now()`    |  |
| `updated_at` | `timestamptz`| NOT NULL, default `now()`    |  |

### `team_members`

| Column     | Type         | Constraints                                                  | Notes |
| ---------- | ------------ | ------------------------------------------------------------ | ----- |
| `team_id`  | `uuid`       | PK (composite with `user_id`), FK → `teams(id)` ON DELETE CASCADE |  |
| `user_id`  | `uuid`       | PK (composite with `team_id`), FK → `users(id)`             |  |
| `role`     | `text`       | NOT NULL, default `'member'`                                | `'owner'` \| `'member'` |
| `joined_at`| `timestamptz`| NOT NULL, default `now()`                                   |  |

A `BEFORE INSERT` trigger enforces **max 3 members per team** (raises
`team_full` SQLSTATE `P0001`). Application code checks the count first to
return a friendly 409.

### `team_invitations`

| Column             | Type         | Constraints                                                       | Notes |
| ------------------ | ------------ | ----------------------------------------------------------------- | ----- |
| `id`               | `uuid`       | PK, default `gen_random_uuid()`                                   |  |
| `team_id`          | `uuid`       | NOT NULL, FK → `teams(id)` ON DELETE CASCADE                       |  |
| `inviter_id`       | `uuid`       | NOT NULL, FK → `users(id)`                                        |  |
| `invitee_username` | `text`       | NOT NULL, FK → `users(username)` (citext)                          | Stored at send-time; resolved by username lookup |
| `status`           | `text`       | NOT NULL, default `'pending'`                                     | `'pending'` \| `'accepted'` \| `'declined'` \| `'expired'` |
| `created_at`       | `timestamptz`| NOT NULL, default `now()`                                         |  |
| `expires_at`       | `timestamptz`| NOT NULL, default `now() + interval '7 days'`                     |  |
| `responded_at`     | `timestamptz`| nullable                                                          | Set on accept / decline |

A `UNIQUE (team_id, invitee_username) WHERE status = 'pending'` index
prevents duplicate open invites to the same user.

### `tasks` (modified)

Add one column:

| Column    | Type   | Constraints                                                       |
| --------- | ------ | ----------------------------------------------------------------- |
| `team_id` | `uuid` | NOT NULL, FK → `teams(id)` ON DELETE CASCADE, indexed             |

Existing `tasks` rows must be migrated: assign them to a default team (or
delete on reset — see §10).

## 7. API (REST)

All endpoints under `/api`. Auth endpoints are public; everything else
requires a valid `mokara_token` cookie. JSON only.

### Auth

| Method | Path                  | Auth | Body / Response                                                |
| ------ | --------------------- | ---- | -------------------------------------------------------------- |
| POST   | `/api/auth/signup`    | no   | `{username, password, display_name?}` → `{user}` + sets cookie |
| POST   | `/api/auth/login`     | no   | `{username, password}` → `{user}` + sets cookie                |
| POST   | `/api/auth/logout`    | no   | clears cookie → 204                                            |
| GET    | `/api/me`             | yes  | `{user}`                                                       |

### Teams

| Method | Path                          | Auth         | Notes |
| ------ | ----------------------------- | ------------ | ----- |
| POST   | `/api/teams`                  | yes          | `{name}` → `{team}` (creator becomes owner) |
| GET    | `/api/teams`                  | yes          | List teams current user belongs to |
| GET    | `/api/teams/:id`              | yes (member) | Team + members + open invitations |
| POST   | `/api/teams/:id/leave`        | yes (member) | Owner can't leave if other members exist |
| GET    | `/api/teams/:id/tasks`        | yes (member) | List tasks in team (supports `?status=`) |
| POST   | `/api/teams/:id/tasks`        | yes (member) | Create task in team |

### Invitations

| Method | Path                            | Auth                | Notes |
| ------ | ------------------------------- | ------------------- | ----- |
| POST   | `/api/teams/:id/invitations`    | yes (member)        | `{username}` → invitation. 409 `team_full` if 3 already |
| GET    | `/api/invitations`              | yes                 | Pending invites for current user |
| POST   | `/api/invitations/:id/respond`  | yes (invitee)       | `{action: "accept" \| "decline"}` |

### Tasks (team-scoped)

| Method | Path                  | Notes                                                                |
| ------ | --------------------- | -------------------------------------------------------------------- |
| GET    | `/api/tasks/:id`      | Must be a member of the task's team                                  |
| PATCH  | `/api/tasks/:id`      | Same                                                                  |
| DELETE | `/api/tasks/:id`      | Same                                                                  |

### Error shape

```json
{ "error": "team_full", "message": "Team already has 3 members" }
```

Stable `error` codes for the frontend to switch on:
`invalid_credentials`, `username_taken`, `weak_password`, `not_authenticated`,
`forbidden`, `team_full`, `already_invited`, `invite_expired`, `not_found`.

## 8. Auth Details

- **Password rules:** min 8 chars, no other complexity requirement.
- **Username rules:** 3–20 chars, `[a-z0-9_]+`. Stored as citext; uniqueness
  is case-insensitive. Cannot be changed in v2.
- **Hashing:** bcrypt cost 10 (≈100 ms on dev hardware).
- **JWT:** HS256, payload `{sub: <user_id>, username, iat, exp}`, `exp` = 7 days.
- **Secret:** `AUTH_SECRET` env var (≥32 random bytes). Same secret in
  `backend/.env` and `frontend/.env` (frontend only uses it for display,
  e.g. dev-time inspection; the cookie is httpOnly so JS can't read it).
- **Cookie:** `mokara_token=<jwt>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800; Secure` (Secure flag on in prod).
- **CORS:** `Access-Control-Allow-Credentials: true`. `CORS_ALLOWED_ORIGINS`
  becomes a single explicit origin (no wildcards) so credentials work.

## 9. Frontend Routes

| Path             | Access    | Purpose                                                                  |
| ---------------- | --------- | ------------------------------------------------------------------------ |
| `/login`         | public    | Sign-in form                                                             |
| `/signup`        | public    | Sign-up form                                                             |
| `/`              | protected | Team list + "Create team" CTA + pending-invitations badge                |
| `/teams/new`     | protected | Create team                                                              |
| `/teams/[id]`    | protected | Team detail: members, invitations, tasks                                 |
| `/invitations`   | protected | List of pending invitations for current user (accept / decline)          |

A Next.js `middleware.ts` redirects:
- unauthenticated users hitting protected paths → `/login`
- authenticated users hitting `/login` or `/signup` → `/`

## 10. Migration Plan (from v1)

The PRD-01 seed has 3 task rows with no team. On apply of the v2 migration:

1. `pnpm db:reset` (developer action — wipes the v1 DB).
2. `pnpm db:migrate` applies the new `auth_and_teams` migration.
3. `pnpm db:seed` creates:
   - 3 demo users: `alice`, `bob`, `charlie` (passwords: `password123`)
   - 1 team `Acme` owned by `alice` with `bob` as a member
   - 1 pending invitation from `alice` to `charlie`
   - 2 demo tasks in `Acme`

There is no automatic migration of v1 task rows. PRD-01 is a developer
preview, not a production system.

## 11. Open Questions / Assumptions

1. **OAuth — DEFERRED:** Username + password is sufficient for v2. OAuth
   providers (Google, GitHub) are explicit out-of-scope.
2. **Team deletion — DEFERRED:** No delete endpoint in v2.
3. **Ownership transfer — DEFERRED:** If the owner wants to leave, all other
   members must leave first.
4. **Email is not stored.** Usernames are the only identifier for invites.
   Password reset (which needs email) is out-of-scope.
5. **JWT secret rotation:** Not supported in v2. Rotating `AUTH_SECRET`
   invalidates all sessions — acceptable for dev.
6. **Rate limiting:** Not implemented. Login is rate-unprotected in v2;
   acceptable for local dev. Defer to a v3 with Redis-backed limiter.