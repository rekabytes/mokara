# Mokara — Memory

## Facts

- pnpm workspace monorepo: `@mokara/frontend` (Next 16.2.10), `@mokara/backend` (Hono 4.12), `@mokara/db` (Prisma 7.8). Node ≥24, pnpm 11.13.
- Postgres 16 + Redis 7 via `docker-compose.yml`. Backend :4200, frontend :4201. `NEXT_PUBLIC_API_BASE_URL` points to backend.
- Auth: HS256 JWT in `mokara_token` httpOnly cookie. bcryptjs (cost 10); Go-format `$2a$` hashes compatible.
- DB trigger `enforce_max_team_members` (3-member cap, `team_full`) + partial index `team_invitations_team_pending_unique` → friendly 409s.
- API error contract `{ error, message }`; Zod via `lib/validate.ts`. Frontend `isApiError` needs both keys + `status`.
- CI on `dev` only: `pnpm typecheck` + `lint` + `format`. Prettier at root (`.pi/` ignored); ESLint 9 frontend-only.
- `pnpm dev`/`dev:backend`/`dev:frontend` chain `pnpm db:bootstrap` (= `prisma migrate deploy && prisma generate`) first. Script is `bootstrap`, NOT `setup` (pnpm 11 reserves `setup`).
- PRD-03 (comments) `docs/development/PRD-03.md`: phase 1 (comments REST + threaded replies + drawer UI) shipped. Phase 2 (SSE infra) + 3 (live wiring) PENDING. Notifications renumbered → PRD-05.
- `comments`: `task_id` (cascade), `author_id`, `parent_id` (self-FK, 1-level threading, cascade), `body` 1–2000. Index `(task_id, created_at)`.
- PRD-04 (analytics) `docs/development/PRD-04.md`: shipped. `canceled` status added app-wide. `task_events` activity log (row per status transition; written server-side on POST + PATCH; backfill seeds creation + done + in_progress). `GET /api/teams/:id/analytics?range=7|30|90` → zero-filled daily buckets + 7-day rolling averages + live totals. `/analytics` page = recharts `^3.10.1`, lines-only.

## Decisions

- 2026-08-21: Analytics chart = **lines-only plotting 7-day rolling average** (`<key>_avg`, `type="monotone"`); raw daily counts live in the hover tooltip. User rejected BOTH raw-count horizontal segments AND bar charts. `WINDOW=7` in `routes/analytics.ts` is the tunable.
- 2026-08-21: `recharts@^3.10.1` pin (React 19; no chart lib in global reference stack — becomes project pin). New token `--color-created: #0ea5e9` (+soft); other series reuse status colors.
- 2026-08-21: Realtime = **SSE** (`streamSSE`) + Redis pub/sub (`ioredis`), NOT WebSocket (one-way push; plain HTTP keeps cookie auth/CORS; `EventSource` auto-reconnect). One `GET /api/events` channel, `{topic,event,data}` envelope, `user:<id>` reserved for notifications (PRD-05).
- 2026-08-21: Comments = REST CRUD + optimistic UI (temp-id insert, rollback); SSE phase 3 adds live updates; REST stays source of truth. No TanStack Query.
- 2026-08-21: Drawer body = flex column; comments list is the only scroll region. Author-only edit/delete, inline confirm, oldest-first, no pagination.
- 2026-08-21: Backend dev = `tsx watch --exclude "**/prisma/generated/**"` (avoids generate-triggered restarts); EADDRINUSE retry 5×300ms + graceful close.
- 2026-08-18: Go+Gin → Hono+TS (shared stack; JSON/cookie unchanged). Skipped `ioredis` until a caching/pub-sub use case. Root `dev` = `pnpm -r --parallel`. `cn()` = clsx+twMerge. Priority cycle low→medium→high. Flag = attention toggle.

## Conventions

- snake_case responses via `lib/types.ts` mappers (`toUser/toTeam/toTask/toInvitation/toComment/toAnalytics`).
- PRD-03 endpoints wrap `{ comments }`/`{ comment }`; older task/team endpoints return bare — don't "fix" either.
- `routes/comments.ts`: list/create `/tasks/:id/comments`, edit/delete `/comments/:id`; membership + author-only. Replies flatten to root.
- `routes/analytics.ts`: membership-gated; server buckets + rolling avg over full history (window edges accurate).
- Workspace import: backend deep path `@mokara/db/prisma/generated/client`.
- Cookie `Secure` only in prod; SameSite=Lax. Trigger/index errors matched by message string.
- Dropdowns: `grid-cols-[1fr_18px]` checkmark slot; selection = checkmark only; hover tint `rgba(99,102,241,0.06)`.
- Toggle row actions: no `transition-opacity`/`focus-within` on inactive branch (decisive).

## Things NOT to do again

- **Don't run dev servers.** User starts their own; verify via typecheck/lint/format/migrate/seed. EADDRINUSE = leftover — `lsof -i :4200,4201`.
- **Don't add bar charts or raw-count horizontal-segment lines to analytics.** Smooth rolling-average lines only (user rejected both alternatives).
- **Don't over-engineer "simple" requests.** Start with the simple path (`transition-colors`, bg change).
- **No Tailwind pseudo-element slide-ins** (`before:content-['']` unreliable in v4). `background-size` arbitrary prefix is `size:` not `length:`.
- **Don't assume token contrast** — check CSS var values (`--color-surface-2` invisible on white).
- **Don't jump to conclusions on UI feedback** — read screenshots, ask which concern.
- **No speculative adjacent changes** — one targeted fix per request.
- **Don't push** to any branch — ASK tier, wait for user.
- **No `h-screen` inside padded containers** — use `h-[calc(100dvh-Xrem)]`.
- **No `box-shadow`+`border-radius` on a child of `overflow-hidden`** — put the look on the wrapper.

## File map (cheat sheet)

- `packages/backend/src/index.ts` — Hono app, route mounting, startup/shutdown.
- `packages/backend/src/lib/{validate,types,logger,jwt}.ts` — error wrapper / mappers / logger / JWT+cookie.
- `packages/backend/src/routes/{auth,teams,invitations,tasks,comments,analytics}.ts` — API routes.
- `packages/frontend/lib/{api,cn,session}.ts` — typed client / cn / session.
- `packages/frontend/app/(app)/tasks/page.tsx` — task list + drawer + comments (~2000 lines).
- `packages/frontend/app/(app)/analytics/page.tsx` — analytics page (recharts).
- `packages/frontend/components/AppShell.tsx` — sidebar nav (Tasks + Analytics).
- `packages/db/prisma/schema.prisma` — User/Team/TeamMember/TeamInvitation/Task/Comment/TaskEvent.
- `packages/db/prisma/migrations/` — `pnpm db:migrate:deploy`; client `pnpm db:generate`.
- `docs/development/PRD-0{1..4}.md` + `docs/design/{system,analytics-mockup}.html`.
- `.pi/AGENTS.md` — this file.
