# Mokara — Memory

## Facts

- pnpm workspace monorepo: `@mokara/frontend` (Next 16.2.10), `@mokara/backend` (Hono 4.12), `@mokara/db` (Prisma 7.8). Node ≥24, pnpm 11.13.
- Postgres 16 + Redis 7 via `docker-compose.yml`. Backend :4200, frontend :4201. `NEXT_PUBLIC_API_BASE_URL` points to backend.
- Auth: HS256 JWT in `mokara_token` httpOnly cookie. bcryptjs (cost 10); Go-format `$2a$` hashes compatible.
- DB trigger `enforce_max_team_members` (3-member cap, `team_full`) + partial index `team_invitations_team_pending_unique` → friendly 409s.
- API error contract `{ error, message }`; Zod via `lib/validate.ts`. Frontend `isApiError` needs both keys + `status`.
- CI on `dev` only: `pnpm typecheck` + `lint` + `format`. Prettier at root (`.pi/` ignored); ESLint 9 frontend-only.
- `pnpm dev`/`dev:backend`/`dev:frontend` chain `pnpm db:bootstrap` (= `prisma migrate deploy && prisma generate`) first. Script is `bootstrap`, NOT `setup` (pnpm 11 reserves `setup`).
- PRD-03 (comments) `docs/development/PRD-03.md`: phase 1 shipped (comments REST + threaded replies + drawer UI). Phase 2 (SSE infra) + 3 (live wiring) PENDING. Notifications renumbered → PRD-05. `comments`: `task_id` (cascade), `author_id`, `parent_id` (self-FK, 1-level threading, cascade), `body` 1–2000; index `(task_id, created_at)`.
- PRD-04 (analytics) `docs/development/PRD-04.md`: shipped. `canceled` status added app-wide. `task_events` = one row per status transition (written server-side on POST + PATCH; backfill seeds creation + done + in_progress). `GET /api/teams/:id/analytics?range=<days>` (any 1–92; series always ends today) → zero-filled daily buckets + cumulative running totals + live totals. `/analytics` = recharts `^3.10.1`, lines-only, trailing 14-day window ending today, every day ticked.
- PRD-04 progress (shipped 2026-09-02): `task_due_changes` (task_id, from_due, to_due, actor_id, created_at; cascade) — written on PATCH only when due_date actually changes. `GET /api/teams/:id/progress` → `{ tasks: [{ id,title,status,created_at,started_at,due_date,completed_at,due_changes[] }] }` — non-canceled tasks WITH due date, due asc; `started_at` = first `in_progress` event (null = never started), `completed_at` = latest `done`.
- Progress card = **day-cell heatmap**: one CSS-grid box per calendar day of the full year (DAY_WIDTH 60, box 48×26, 6px gutters) sharing its column with that day's number. States: `waiting` hollow (exists, not started) · `upcoming` dotted (runway to deadline) · `active` indigo · `late` red · `done` green + ✓ · `ghost` (deadline day after completion). Deadline day = dark ring, moved deadline = amber tick, weekend + today = column tints behind all rows (one overlay). Hover = cursor-following popover built from `data-` attrs. `HeatRow` is `memo`ed so hover never re-renders the 365-col track. Drag-scroll + jump-to-month + center-on-today kept. Quieter single-hue option = variant B in `docs/design/progress-heatmap-mockup.html`. KPI strip = LATER phase (user will ask).

## Decisions

- 2026-09-02: Progress card is a **day-cell heatmap, not bars**. Bars snapped to column *edges* while the date numbers sit *centred* in their column, so every bar read half a day off ("the bar is not align to the date"). One box per day inside the day's own grid column removes that whole bug class. Supersedes the 2026-08-21 positioned-div bar Gantt and its "actual bar starts at `in_progress`, planned band from creation" rule — the band is gone, the cells carry it.
- 2026-09-02: **Two different "today"s, knowingly.** Backend `/analytics` buckets by UTC day (`setUTCHours`), so the Activity chart rolls over at 08:00 local; the heatmap uses the browser clock anchored at local midnight. Only diverges between midnight and 08:00 — leave it unless the user asks to unify.
- 2026-09-01: **Tasks have no user-entered start date.** The due-date chip is a single-date picker (`tasks/DatePicker.tsx`, replaces `DateRangePicker.tsx`; one click commits + closes, presets Today / +7 days / No date, accepts both `YYYY-MM-DD` and the API's RFC3339). The real start is observable from the `todo → in_progress` event, so a hand-picked start date was noise. `tasks.start_date` dropped (migration `20260901000000_drop_task_start_date`) plus `start_date` removed from create/PATCH schemas, `TaskResponse`, `api.Task`. Drawer clears with `due_date: null` (was `undefined`, which JSON.stringify dropped → "No date" did nothing).
- 2026-09-01: Analytics window = **trailing 14 days ending today** (`WINDOW_DAYS=14` → `range=14`; right edge = today, `interval={0}` so every date is ticked; missing days carry the previous cumulative forward). Supersedes the calendar-month + Week 1–4 dropdown model: a month window is mostly future carry-forward days, so all four lines drew dead straight. The flatness was the *window*, not the cumulative-lines choice below — that stands.
- 2026-08-21: Analytics chart = **lines-only plotting cumulative running totals** (`type="monotone"`); non-decreasing, quiet days carry forward. Tooltip shows e.g. `Created 47 (+3 today)`, delta computed client-side from the previous day. User rejected raw-count horizontal segments, bar charts, AND a 7-day rolling average (redundant once cumulative is naturally smooth).
- 2026-08-21: `recharts@^3.10.1` pin (React 19; no chart lib in the global stack — becomes project pin). Token `--color-created: #0ea5e9` (+soft); other series reuse status colors.
- 2026-08-21: Realtime = **SSE** (`streamSSE`) + Redis pub/sub (`ioredis`), NOT WebSocket (one-way push; plain HTTP keeps cookie auth/CORS; `EventSource` auto-reconnect). One `GET /api/events` channel, `{topic,event,data}` envelope, `user:<id>` reserved for notifications (PRD-05).
- 2026-08-21: Comments = REST CRUD + optimistic UI (temp-id insert, rollback); SSE phase 3 adds live updates; REST stays source of truth. No TanStack Query.
- 2026-08-21: Drawer body = flex column; comments list is the only scroll region. Author-only edit/delete, inline confirm, oldest-first, no pagination.
- 2026-08-21: Backend dev = `tsx watch --exclude "**/prisma/generated/**"` (avoids generate-triggered restarts); EADDRINUSE retry 5×300ms + graceful close.
- 2026-08-18: Go+Gin → Hono+TS (shared stack; JSON/cookie unchanged). Skipped `ioredis` until a caching/pub-sub use case. Root `dev` = `pnpm -r --parallel`. `cn()` = clsx+twMerge. Priority cycle low→medium→high. Flag = attention toggle.

## Conventions

- snake_case responses via `lib/types.ts` mappers (`toUser/toTeam/toTask/toInvitation/toComment/toAnalytics`).
- PRD-03 endpoints wrap `{ comments }`/`{ comment }`; older task/team endpoints return bare — don't "fix" either.
- `routes/comments.ts`: list/create `/tasks/:id/comments`, edit/delete `/comments/:id`; membership + author-only. Replies flatten to root.
- `routes/analytics.ts`: membership-gated; server buckets + cumulative running totals over full history (window edges accurate; series ends today). `range` = any integer 1–92 (clamped), default 30. Also hosts `GET /teams/:id/progress` (heatmap data).
- Workspace import: backend deep path `@mokara/db/prisma/generated/client`.
- Cookie `Secure` only in prod; SameSite=Lax. Trigger/index errors matched by message string.
- Dropdowns: `grid-cols-[1fr_18px]` checkmark slot; selection = checkmark only; hover tint `rgba(99,102,241,0.06)`.
- Toggle row actions: no `transition-opacity`/`focus-within` on inactive branch (decisive).

## Things NOT to do again

- **Don't run dev servers.** User starts their own; verify via typecheck/lint/format/migrate/seed. EADDRINUSE = leftover — `lsof -i :4200,4201`.
- **Date math — never derive a day index from a live timestamp or a `.toISOString()` round-trip.** `Math.round((now - jan1)/DAY)` with `now` = current instant rounds PAST LOCAL NOON up to *tomorrow* (drew the heatmap's today line on the wrong date), and `.toISOString()` shifts back a day in +UTC timezones (duplicate React keys, misaligned axis). Anchor on local midnight: `new Date(y, m, d)`.
- **Don't put HTML into a quoted data attribute in a hand-built string** — the mockup's tooltip leaked `Sat, Aug 15 — In progress` as visible text all over the cells. React escapes props correctly; plain template strings don't. Store plain `data-` values and compose the markup at render time.
- **No bars in the progress card; no bar charts / raw-count segments / rolling averages in the Activity chart.** Day cells for progress, cumulative running-total lines for activity — the user rejected each alternative explicitly.
- **NEVER add behavior I wasn't asked for — especially hiding things.** Root rule behind the analytics week-filter incident: I hid "future" weeks from a dropdown and swapped the chart for a "No activity in this window yet" empty state, both unrequested. User: "don't overcomplicate, don't overthink, just do what I asked; if I didn't ask, don't." Concretely: never filter dropdown options by "not started/empty", never replace a chart/list with an empty-state message, never invent conditional visibility. Render everything (zero-filled if no data). Any such "smart" default must be explicitly asked for first.
- **Do EXACTLY what the user wants, in the phase they want it.** A user-requested feature belongs in the CURRENT phase — only defer what the USER deferred (e.g. KPI strip → later). Don't re-confirm scope repeatedly; once confirmed, execute.
- **Don't over-engineer "simple" requests.** Start with the simple path (`transition-colors`, bg change).
- **No Tailwind pseudo-element slide-ins** (`before:content-['']` unreliable in v4). `background-size` arbitrary prefix is `size:` not `length:`.
- **Don't assume token contrast** — check CSS var values (`--color-surface-2` invisible on white).
- **Don't jump to conclusions on UI feedback** — read screenshots, ask which concern.
- **No speculative adjacent changes** — one targeted fix per request.
- **Don't push** to any branch — ASK tier, wait for user.
- **No `h-screen` inside padded containers** — use `h-[calc(100dvh-Xrem)]`.
- **No `box-shadow`+`border-radius` on a child of `overflow-hidden`** — put the look on the wrapper.
- **Grid/flex children default to `min-width: auto`** — wide content (e.g. the 365-day heatmap track) stretches the whole page instead of scrolling inside `overflow-x-auto`. Add `min-w-0` to the grid/flex item (`AppShell <main>` has it for this reason).

## File map (cheat sheet)

- `packages/backend/src/index.ts` — Hono app, route mounting, startup/shutdown.
- `packages/backend/src/lib/{validate,types,logger,jwt}.ts` — error wrapper / mappers / logger / JWT+cookie.
- `packages/backend/src/routes/{auth,teams,invitations,tasks,comments,analytics}.ts` — API routes.
- `packages/frontend/lib/{api,cn,session}.ts` — typed client / cn / session.
- `packages/frontend/app/(app)/tasks/page.tsx` — task list + drawer + comments (~2000 lines).
- `packages/frontend/app/(app)/tasks/DatePicker.tsx` — single-date (due date) popover, portal + month grid.
- `packages/frontend/app/(app)/analytics/page.tsx` — Activity line chart (recharts) + Progress day-cell heatmap.
- `packages/frontend/components/AppShell.tsx` — sidebar nav (Tasks + Analytics); `min-w-0` main.
- `packages/db/prisma/schema.prisma` — User/Team/TeamMember/TeamInvitation/Task/Comment/TaskEvent/TaskDueChange.
- `packages/db/prisma/migrations/` — `pnpm db:migrate:deploy`; client `pnpm db:generate`.
- `docs/development/PRD-0{1..4}.md` + `docs/design/{system,analytics-mockup,progress-heatmap-mockup}.html`.
- `.pi/AGENTS.md` — this file.
