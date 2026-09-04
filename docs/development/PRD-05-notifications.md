# PRD-05 — Centralized Notifications

## 1. Goal

The bell on every page's breadcrumb bar has been a dead placeholder. This PRD
turns it into the **one centralized notification center**: a right-side drawer
(approved mockup: `docs/design/notifications-mockup.html`) over a live
server stream, fed by the SSE + Redis architecture decided on 2026-08-21
(the `user:<id>` topic was reserved for exactly this).

## 2. Shape (owner-approved)

- Bell click → **right-side drawer, non-blocking** (no backdrop; the page
  stays usable). Closes on ✕, Esc, or the Close button.
- **Unread badge** on the bell from any page; unread rows get an accent dot +
  semibold text; grouped Today / Earlier; relative times.
- Rows are **deep-links**: clicking marks the row read and navigates into the
  payload's container (`setSelectedId(team_id)` → `/tasks`).
- **Live over SSE**: new notifications appear at the top while open — no
  polling.

## 3. Data

`notifications` table (migration `20260904120000_notifications`): recipient,
string `type` (UI-growable without a migration), JSON `payload` (whatever the
row needs to render + link), `read_at`, `created_at`; index
`(user_id, created_at DESC)`; cascade on user delete. Payload shapes:

    invitation          { actor_username, team_name, team_id }
    invitation_accepted { actor_username, team_name, team_id }
    comment_reply       { actor_username, task_id, task_title, team_id, snippet }

## 4. Delivery

- `lib/events.ts` — `publishToUser(userId, event)` → Redis pub/sub on
  `mokara:user:<id>`.
- `GET /api/events` — SSE bridge: one duplicated Redis subscriber per signed-in
  browser, 25s pings, full teardown on abort. Cookie auth rides the authed
  surface; EventSource reconnects natively.
- The REST surface backfills and persists: `GET /notifications` (latest 50 +
  unread count), `POST /notifications/read` (`ids` array or null = mark all).

## 5. Generators (phase 1)

- **Team invitation created** → the invitee.
- **Invitation accepted** → the inviter.
- **Comment reply** → the thread root's author (never yourself).
- Generation is **best-effort**: a failed insert/publish logs and never takes
  down the action that caused it.

## 6. Non-goals / phase 2

- **Due-date reminders** — need a server-side scheduler + dedupe; the type is
  reserved, the generator is not built.
- Mentions (`@username` parsing), per-notification preferences, retention
  culling, load-more pagination (v1 lists the latest 50).

## 7. Frontend

- `lib/notifications.ts` — module atoms (list, unread, panel-open) on the
  default store; one REST backfill + one `EventSource("/api/events")` per app
  lifetime (`booted` guard, same pattern as session/containers); SSE pushes
  prepend + bump the badge.
- `components/NotificationBell.tsx` — replaces the four copied placeholder
  buttons in the breadcrumb bars (tasks, analytics, team page, settings); the
  "verbatim header" rule evolves: star stays copied, the bell is this shared
  component.
- `components/NotificationDrawer.tsx` — mounted **once in AppShell** so it
  exists on every page; Esc listener (documented effect), deep-link navigation
  through the container switcher.

## 8. Decisions made (owner-approved via the mockup)

- Right-side drawer, non-modal (no backdrop) — owner picked "right sidebar or
  a modal on the right side"; drawer matches the tasks-drawer pattern.
- Grouped by day; unread dot + badge; mark-all persisted server-side.
- Invites stay dual-channel: the notification informs; acceptance still flows
  through the existing switcher flow.
- SSE shared with the future PRD-03 phase-2 comments stream (one endpoint,
  typed events).
