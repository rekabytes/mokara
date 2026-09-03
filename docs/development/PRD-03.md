# PRD-03: Task Comments + Realtime Channel (SSE)

**Status:** Draft
**Owner:** TBD
**Depends on:** PRD-02 (auth + teams), PRD-01 (tasks)
**Last updated:** 2026-08-21

---

## 1. Overview

v3 adds **comments** to tasks, surfaced inside the task detail drawer, with
**live updates** delivered over a **Server-Sent Events (SSE)** channel.

The comment feature itself is plain REST CRUD. The realtime channel is the
strategic piece: it is built as a **general-purpose, multiplexed push
primitive** (one SSE connection per user session, topic-addressed messages)
so that future features — most importantly **notifications (PRD-04)** — can
ride the same channel without any rework.

Decision trail (why this shape):

- **REST, not WebSocket, for writes.** Comments are created/edited/deleted
  via normal authenticated REST calls, consistent with the whole codebase.
- **SSE, not WebSocket, for push.** Every push use case we have or foresee
  (live comments, notifications, task updates) is one-way server → client.
  SSE is plain HTTP (cookie auth and CORS middleware work unchanged), Hono
  supports it natively (`hono/streaming` → `streamSSE`), and the browser's
  `EventSource` gives auto-reconnect for free. WebSocket's bidirectionality
  buys us nothing today.
- **Redis pub/sub, not in-process EventEmitter.** Redis 7 is already in
  `docker-compose.yml` (unused until now — PRD-01 reserved it for exactly
  this kind of work). Pub/sub via `ioredis` removes the single-process
  scaling cliff before we hit it.

## 2. Goals

- Team members can comment on a task from the task detail drawer.
- Comment authors can edit and delete their own comments.
- Comments posted by _other_ members appear **live** in an open drawer
  (no reload, no polling).
- Establish one global SSE channel (`GET /api/events`) with a
  topic-based message envelope, ready to carry notifications in PRD-04.
- Keep all writes on REST; SSE is additive and never the source of truth
  (REST + refetch-on-reconnect remains the recovery path).

## 3. Out of Scope (this PRD)

- **Notifications** (UI, persistence, unread counts) — PRD-04. This PRD only
  reserves the `user:<id>` topic on the channel.
- Mentions (`@username`), reactions, attachments, edit history / audit trail.
- Comment pagination beyond a simple cap (see §6); task activity feed.
- WebSocket, long polling, typing indicators, presence.
- Multi-tab dedup beyond naive id-based merging (two tabs of the same user
  each hold their own SSE connection — fine at this scale).

## 4. Core Features

| #   | Feature              | Description                                                                                                                                                  |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | List comments        | Drawer shows all comments for the open task, oldest first, with author + relative timestamp.                                                                 |
| F2  | Add comment          | Composer pinned to the bottom of the comments section. Optimistic insert on submit.                                                                          |
| F3  | Edit own comment     | Author-only inline edit (same composer pattern). `updated_at` bumps; no edit history.                                                                        |
| F4  | Delete own comment   | Author-only hard delete with inline confirm.                                                                                                                 |
| F5  | Live new comments    | Another member's comment appears in an open drawer within ~1s via SSE.                                                                                       |
| F6  | Live edit/delete     | Edits and deletes by others propagate live (body updates / row removal).                                                                                     |
| F7  | SSE channel          | `GET /api/events` — one multiplexed connection, topic-addressed JSON events, heartbeat keep-alive.                                                           |
| F8  | Graceful degradation | If SSE drops: auto-reconnect (`EventSource`), then REST refetch to resync. UI shows nothing special on transient blips.                                      |
| F9  | Threaded replies     | Reply to any comment (one level deep): rendered under the parent with a `↳ replying to @user` chip; composer enters reply mode with an `@username ` prefill. |

## 5. Tech Stack (additions vs PRD-02)

| Layer       | Addition                                                       | Why                                                   |
| ----------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Backend     | `ioredis` (^5.x)                                               | Redis pub/sub fan-out across backend processes.       |
| Backend     | `hono/streaming` (`streamSSE`) — ships with `hono`, no new dep | SSE responses.                                        |
| Backend env | `REDIS_URL` (default `redis://localhost:6379`)                 | Points at the existing `mokara-redis` container.      |
| Frontend    | **No new dependencies.**                                       | Native `EventSource` + existing fetch/state patterns. |

> Frontend deliberately does **not** introduce TanStack Query in this PRD.
> The tasks page manages state by hand today; comments follow the same
> pattern with a small event-apply layer. Revisit if a third live resource
> appears.

## 6. Data Model

### `comments` (new table)

| Column       | Type          | Constraints                                                   | Notes                                     |
| ------------ | ------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `id`         | `uuid`        | PK, default `gen_random_uuid()`                               |                                           |
| `task_id`    | `uuid`        | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE                  | Deleting a task deletes its comments.     |
| `author_id`  | `uuid`        | NOT NULL, FK → `users(id)`                                    | Kept even if author later leaves team.    |
| `parent_id`  | `uuid`        | nullable, self-FK → `comments(id)` ON DELETE CASCADE, indexed | Reply target; delete cascades to replies. |
| `body`       | `text`        | NOT NULL                                                      | 1–2000 chars after trim.                  |
| `created_at` | `timestamptz` | NOT NULL, default `now()`                                     |                                           |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`                                     | Bumped on edit.                           |

Indexes: `@@index([task_id, created_at])` — the only query pattern is
"comments for this task, chronological".

Prisma relations: `Task.comments Comment[]`, `User.comments Comment[]`,
`Comment.task` (`onDelete: Cascade`), `Comment.author`.

No soft-delete, no tombstones — deletion is final (v1 decision; revisit only
if moderation asks for it).

## 7. API

### 7.1 Comments (REST)

All require the `mokara_token` cookie. All enforce **membership in the
task's team** via the existing `getTeamRole()` helper
(`lib/team-membership.ts`).

| Method | Path                      | Who         | Body / Result                                                                                                               |
| ------ | ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/tasks/:id/comments` | team member | `{ comments: [...] }` oldest → newest (flat; replies carry `parent_id`)                                                     |
| POST   | `/api/tasks/:id/comments` | team member | `{ body, parent_id? }` → `201 { comment }`. Parent must be on the same task; replies to replies flatten to the thread root. |
| PATCH  | `/api/comments/:id`       | author only | `{ body }` → `{ comment }`                                                                                                  |
| DELETE | `/api/comments/:id`       | author only | `204`                                                                                                                       |

Validation via the existing Zod wrapper (`lib/validate.ts`):
`body` = string, `.trim()`, `.min(1)`, `.max(2000)`.

Error codes (existing contract `{ error, message }`): reuse `not_found`
(404 task/comment, or comment not in a task the user can see) and
`forbidden` (403 non-author PATCH/DELETE).

### 7.2 JSON shape

snake_case via a new `toComment()` mapper in `lib/types.ts`:

```json
{
  "id": "…",
  "task_id": "…",
  "author_id": "…",
  "author": { "id": "…", "username": "alice", "display_name": "Alice" },
  "parent_id": null,
  "body": "Ship it 🚀",
  "created_at": "2026-08-21T10:00:00.000Z",
  "updated_at": "2026-08-21T10:00:00.000Z"
}
```

`author` is embedded (join to `toUser()` shape) so the drawer never needs a
second fetch to render names.

### 7.3 SSE channel

| Method | Path          | Auth | Notes                                            |
| ------ | ------------- | ---- | ------------------------------------------------ |
| GET    | `/api/events` | yes  | `Content-Type: text/event-stream`, no buffering. |

**Subscription model.** Client passes desired topics as a query param:

```
GET /api/events?topics=task:5f0c…
```

- The server **always implicitly adds** `user:<currentUserId>` (reserved for
  PRD-04 notifications — no events will be emitted on it in this PRD).
- **Authorization at subscribe time:** for each `task:<id>` topic the server
  verifies team membership; unauthorized topics are silently dropped (not an
  error — avoids leaking which task ids exist).
- Topic set changes (drawer opens/closes) → client closes and reopens the
  `EventSource` with the new query. Reconnect churn is negligible (only on
  drawer open/close). No control channel needed.

**Wire format.** Each SSE message:

```
event: message
data: {"topic":"task:5f0c…","event":"comment.created","data":{…comment…}}
```

Envelope fields: `topic` (string), `event` (string, `<resource>.<action>`),
`data` (object — same snake_case shapes as REST). Envelope is intentionally
resource-agnostic so PRD-04 can add `notification.created` without changes.

Events emitted in this PRD:

| Event             | Published to    | `data` payload               | Triggered by            |
| ----------------- | --------------- | ---------------------------- | ----------------------- |
| `comment.created` | `task:<taskId>` | full comment (with `author`) | POST comment succeeds   |
| `comment.updated` | `task:<taskId>` | full comment (with `author`) | PATCH comment succeeds  |
| `comment.deleted` | `task:<taskId>` | `{ id }`                     | DELETE comment succeeds |

**Keep-alive:** SSE comment line (`: ping`) every **25 s** — keeps dev
proxies and idle connections from being reaped.

**Publish ordering:** DB write first, `publish()` after commit succeeds.
Publish failure is logged but never fails the request (REST is truth; SSE is
an accelerator).

## 8. Realtime Architecture (backend)

```
POST /api/tasks/:id/comments ──► DB insert ──► 201 response
                                     │
                                     └─► pubsub.publish("task:<id>", "comment.created", comment)
                                              │ (Redis PUBLISH mokara:events:task:<id>)
                                              ▼
                         every backend process subscribed to that channel
                                              │
                                              ▼
                         SSE connections holding topic "task:<id>"
                                              │
                                              ▼
                         EventSource on clients with that drawer open
```

New module: `packages/backend/src/lib/pubsub.ts`

- Two `ioredis` connections (Redis requires the subscriber connection to be
  in subscriber mode): one `publish` client, one `subscribe` client.
- Channel naming: `mokara:events:<topic>` (namespace everything we own).
- API surface: `publish(topic, event, data)`,
  `onTopic(topic, handler): unsubscribe`, lazy connect on first use.
- Redis down at startup → warn + continue: REST keeps working, live updates
  are simply inert. (Dev-friendly; never block boot on Redis.)

New module: `packages/backend/src/routes/events.ts`

- `streamSSE` handler behind `authRequired`.
- Parses + authorizes topics (§7.3), subscribes to each via pubsub, writes
  events through the stream, heartbeat interval per connection, cleans up
  subscriptions + interval on `AbortSignal` (client disconnect).
- Mounted in `index.ts` on the `authed` router: `authed.get("/events", …)`.

## 9. Frontend Design

### 9.1 Drawer layout

- Comments render as the **bottom section of the task detail drawer** (not a
  tab — always visible, zero extra clicks).
- Section header: `Comments` + count badge. Empty state:
  `No comments yet. Start the conversation.`
- Each row: initial-avatar (derived from display name/username, color
  hashed), author name, relative timestamp (`3m ago` — small shared helper,
  re-rendered on minute tick), body (pre-wrap), hover-revealed edit/delete
  icons **on own comments only**.
- Composer pinned at the bottom of the section: auto-growing textarea,
  disabled-when-empty submit button, `⌘/Ctrl+Enter` submits.
- Edit mode reuses the composer inline; cancel restores previous body.
- Delete = inline confirm (button flips to `Delete? Yes / No`) — no modal.

### 9.2 Data + live wiring

- `lib/api.ts`: add `Comment` type + `listComments`, `createComment`,
  `updateComment`, `deleteComment` (same `fetch` + `isApiError` patterns).
- Comments state lives with the drawer: fetched when a task is opened,
  cleared when closed.
- New hook: `lib/hooks/useEventStream.ts`
  - Owns a single `EventSource` (`API_BASE_URL + /api/events?topics=…`).
  - Input: `topics: string[]` (derived from the open drawer's task id; empty
    when no drawer). Reconnect-with-new-query when the set changes.
  - Output: `subscribe(matcher, handler)` registry; dispatches parsed
    envelopes to matching handlers.
  - On `error`/`open` after a drop: notify listeners so the drawer can
    **refetch comments once** to resync (cheap, idempotent).
- Applying events in the drawer:
  - `comment.created` → skip if `id` already present (author's own optimistic
    insert arrives back via SSE — **dedupe by id**), else append.
  - `comment.updated` → replace by id if present.
  - `comment.deleted` → remove by id if present.
- Optimistic behavior for the acting user: POST/PATCH/DELETE mutate local
  state immediately, rollback on non-2xx with an inline error toast.

### 9.3 Known platform constraints (and our answers)

- **`EventSource` can't set fetch credentials.** It relies on ambient
  cookies. This works because frontend (`:4201`) and backend (`:4200`) are
  **same-site** (both `localhost`; SameSite=Lax ignores port), and in prod we
  expect same-origin behind one domain. The backend CORS middleware must
  allow the SSE origin explicitly (no wildcard). **Fallback if a browser
  ever refuses:** one-time tickets (`POST /api/events/ticket` → short-lived
  token in query param). Not built until needed.
- **Browser HTTP/1.1 connection limit (6/domain)** counts the SSE socket.
  Only one drawer is open at a time, so we hold ≤1 SSE + ≤5 for REST — fine.
  Becomes moot if we serve over HTTP/2 later.

## 10. Phased Implementation Plan

Build and verify each phase end-to-end before starting the next. Each phase
must pass `pnpm typecheck` (+ `pnpm lint`, `pnpm format`) and get a manual
two-user smoke test in the browser.

### Phase 1 — Comments REST + drawer UI (no realtime)

1. Migration: `comments` table (§6) via Prisma; `pnpm db:migrate:deploy` +
   `pnpm db:generate`.
2. Backend: `toComment()` mapper; comment routes (GET/POST under
   `/tasks/:id/comments`, PATCH/DELETE under `/comments/:id`) in a new
   `routes/comments.ts` mounted on the authed router; membership +
   author-only checks.
3. Frontend: `Comment` type + API helpers; comments section, composer,
   edit/delete in the drawer.
4. **Verify:** typecheck/lint/format; two-browser manual test
   (alice comments, bob reads — bob needs a refresh to see it; that gap is
   exactly what Phase 3 closes).

### Phase 2 — SSE infrastructure (no product behavior change yet)

1. `ioredis` dep; `REDIS_URL` in `env.ts` + `.env.example`.
2. `lib/pubsub.ts` (§8); resilient startup (warn, don't crash).
3. `routes/events.ts`: auth, topic parse + membership authorization,
   heartbeat, cleanup on disconnect; mount in `index.ts`.
4. Frontend `useEventStream` hook + a dev-only log of received envelopes.
5. **Verify:** `curl -N` with the cookie shows the heartbeat; two terminals
   prove fan-out; killing/reopening the connection exercises cleanup;
   typecheck/lint/format.

### Phase 3 — Live comments wiring

1. Backend: publish `comment.created/updated/deleted` after each successful
   write (§7.3 table).
2. Frontend: drawer subscribes to `task:<openTaskId>`; apply events per
   §9.2 (id-dedupe, replace, remove); resync-refetch on reconnect.
3. **Verify:** two browsers / two users — bob's open drawer receives alice's
   comment, edit, and delete live; author's own optimistic insert doesn't
   double-render; network-tab SSE reconnect resyncs state.

### Phase 4 — Handoff to PRD-04 (not built here)

The channel ships ready: `user:<id>` topic is always subscribed, the
envelope is resource-agnostic, and pubsub needs zero changes. PRD-04 adds a
`notifications` table, writes + `notification.created` events, and the bell
UI.

## 11. Open Questions / Assumptions

1. **Comment order — ASSUMED oldest-first** (chronological conversation
   read). Flip to newest-first later if it feels wrong; it's one `orderBy`.
2. **No edit window** — authors can edit/delete forever. Slack-style expiry
   rejected for simplicity.
3. **Replies are one level deep** — a reply to a reply attaches to the thread
   root (backend enforces). Deleting a comment cascades to its replies.
4. **2000-char body cap** — arbitrary but sane; no rich text, plain text
   with preserved newlines.
5. **No pagination** — teams cap at 3 members; even heavy usage stays in
   "fetch all" territory. Add cursor pagination if any task crosses ~200
   comments.
6. **Comment author who left the team** — comment stays, author still
   renders (join by id), but they can no longer edit/delete (membership
   check fails). Acceptable.
7. **SSE cookie auth assumes same-site origins** (§9.3). Valid today
   (localhost) and in the expected prod layout; ticket fallback documented,
   not built.
8. **Events are at-most-once in practice** (Redis pub/sub drops messages for
   disconnected subscribers). That's fine: reconnect-triggered refetch is the
   correctness mechanism; SSE only needs to be _fast_, not _reliable_.
