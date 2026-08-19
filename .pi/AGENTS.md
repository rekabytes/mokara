# Mokara — Memory

## Facts

- pnpm workspace monorepo: `@mokara/frontend` (Next 16.2.10), `@mokara/backend` (Hono 4.12), `@mokara/db` (Prisma 7.8). Node ≥24, pnpm 11.13.
- Postgres 16 + Redis 7 via `docker-compose.yml`. Backend :4200, frontend :4201. `NEXT_PUBLIC_API_BASE_URL` points to backend.
- Auth: HS256 JWT in `mokara_token` httpOnly cookie (name shared with frontend `proxy.ts` route guard). bcryptjs (cost 10); Go-format `$2a$` hashes are compatible.
- DB has trigger `enforce_max_team_members` (3-member cap, raises `team_full`) and partial unique index `team_invitations_team_pending_unique` — backend maps both to friendly 409s.
- API error contract: `{ error: <code>, message: <text> }`. Zod errors go through `lib/validate.ts` wrapper to keep that shape (frontend `isApiError` requires both keys).
- Schema additions: `Task.flagged Boolean @default(false)` (toggle via `POST /api/tasks/:id/flag`).
- CI: `.github/workflows/ci.yml` runs on `push`/`pull_request` to `dev` only — `pnpm typecheck` + `pnpm lint` + `pnpm format`.
- Prettier at root (`pnpm format` / `pnpm format:fix`), config in `.prettierrc`. `.pi/` excluded via `.prettierignore`. ESLint 9 flat config in `packages/frontend/eslint.config.mjs` (frontend-only for now).
- PRD-03 (comments + realtime) lives in `docs/development/PRD-03.md`; phases: 1 comments REST+UI (done, uncommitted), 2 SSE infra, 3 live wiring, 4 → PRD-04 notifications.
- `comments` table: `task_id` (FK, cascade), `author_id`, `body` (1–2000 chars), index `(task_id, created_at)`.

## Decisions

- 2026-08-21: Realtime = **SSE** (`hono/streaming` `streamSSE`) + Redis pub/sub (`ioredis`), NOT WebSocket. Reason: all push use cases (live comments, notifications) are one-way; SSE is plain HTTP so cookie auth/CORS work unchanged; `EventSource` gives auto-reconnect free. One multiplexed `GET /api/events` channel, `{topic, event, data}` envelope, `user:<id>` topic reserved for notifications (PRD-04).
- 2026-08-21: Comments = REST CRUD with optimistic UI (temp-id insert, rollback on error); live updates arrive via SSE in phase 3 — REST stays source of truth, refetch-on-reconnect is the recovery path.
- 2026-08-21: No TanStack Query for comments — kept the existing plain-state pattern; revisit if a third live resource appears.
- 2026-08-21: Drawer body restructured to flex column; comments list is the drawer's **only** scroll region (title/description/chips stay fixed). Author-only edit/delete, hard delete with inline confirm, oldest-first, no pagination (3-member teams).
- 2026-08-18: Replaced Go+Gin backend with Hono+TS. JSON shapes and cookie name unchanged so frontend stayed untouched. Reason: shared TS stack, faster iteration, single language.
- 2026-08-18: Skipped `ioredis` despite global reference. Reason: no caching use case yet.
- 2026-08-18: Combined root `dev` uses `pnpm -r --parallel --filter ... run dev` (not `&`). Reason: portable across platforms.
- 2026-08-18: `cn()` helper uses `clsx` + `twMerge`. Reason: dedupes conflicting Tailwind utilities (matches global reference).
- 2026-08-18: Priority cycling order is `low → medium → high → low` (clicking the priority bars in the task row). Reason: ascending intensity feels more natural than the default DB order.
- 2026-08-18: Flag icon = "flag for attention" (toggle), not "cycle priority". Reason: flag metaphor reads correctly; cycle moved to priority badge click.
- 2026-08-21: Backend dev = `tsx watch --exclude "**/prisma/generated/**" src/index.ts`. Reason: `prisma generate` (runs on every `pnpm typecheck`/`db:generate`) rewrote the generated client inside tsx's watch graph → live backend restarted "randomly" → EADDRINUSE race vs graceful shutdown. `index.ts` also retries bind 5×300ms on EADDRINUSE and calls `closeIdleConnections`/`closeAllConnections` on shutdown so the socket frees before the next child binds.

## Conventions

- Response shape: snake_case JSON decoupled from Prisma's camelCase models via `lib/types.ts` mappers (`toUser`, `toTeam`, `toTask`, `toInvitation`, `toComment`).
- PRD-03 endpoints wrap payloads: `{ comments: [...] }` / `{ comment: {...} }` (older task/team endpoints return bare objects/arrays — don't "fix" either side).
- `routes/comments.ts`: list/create under `/tasks/:id/comments`, edit/delete under `/comments/:id`; all need team membership, PATCH/DELETE additionally author-only. Replies: `parent_id` (1 level — replies to replies flatten to root, enforced backend); delete cascades to replies.
- Workspace import: backend uses deep path `@mokara/db/prisma/generated/client` (db package has no `exports` field).
- Cookie auth: `Secure` flag only in `ENV=production`. SameSite=Lax, Path=/, HttpOnly.
- Postgres trigger / partial-index errors are matched on message string (`"team_full"`, `"team_invitations_team_pending_unique"`) — robust to adapter wrapping.
- Dropdown menu items: 2-column grid `grid-cols-[1fr_18px]` — text on the left + a fixed 18px slot reserved for the checkmark. Anchors container width to (longest text + checkmark) so the menu doesn't breathe when selection changes.
- Toggle-style row actions (e.g. flag): no `transition-opacity` and no `focus-within` on the inactive branch — click should feel decisive and the icon disappears immediately rather than lingering while the button stays focused.
- Selected state in dropdowns is shown by the checkmark only, not an extra bg tint. Unselected rows get a subtle `rgba(99,102,241,0.06)` indigo tint on hover via plain `transition-colors` (no pseudo-element tricks).

## Things NOT to do again

- **Don't run dev servers.** No `pnpm dev`, `next dev`, `tsx watch`, `go run`, foreground `docker compose up`, etc. The user starts their own. Use typecheck / lint / test / build / migrate / seed for verification. EADDRINUSE means a leftover from a previous session — `lsof -i :4200,4201` to find it; the user kills it.
- **Don't over-engineer "simple" requests.** "Simple hover animation, just a background change" = `transition-colors` + `hover:bg-[color]`. Start there. Don't reach for pseudo-elements or bg-gradient size tricks unless the simple path fails.
- **Don't use Tailwind pseudo-element slide-in tricks.** `before:content-['']` doesn't reliably compile the `content` property in Tailwind v4 — the pseudo-element never renders and the animation silently doesn't run. Use a CSS-only fallback (`transition-colors`, `bg-gradient-to-r` + size animation, etc.).
- **In Tailwind v4, the arbitrary-value prefix for `background-size` is `size:`, not `length:`.** `bg-[length:0%_100%]` produces invalid CSS; `bg-[size:0%_100%]` is correct. Same goes for any arbitrary property — use the CSS property name (`size`, `position`, `repeat`, `image`, etc.).
- **Don't assume design tokens have contrast against their parent.** Check the CSS variable values before pairing. `--color-surface-2` is `rgba(255,255,255,0.55)` — invisible on a `bg-white` container. For hover on white surfaces, use `--color-accent-soft` or a custom rgba with sufficient alpha.
- **Don't jump to conclusions on UI feedback.** "The selection is changing" — read screenshots first, ask which concern (selection visual? selection state? container size?). The user is testing whether you'll fold under pressure or push back on a wrong assumption.
- **Don't make speculative changes to adjacent code** when one targeted fix is asked for. If asked to fix the dropdown, don't also touch the chip / button / focus styles. Smaller diffs review better.
- **Don't push to `main` (or any branch).** `git push` is in the ASK tier — wait for the user.
- **Don't reach for `h-screen` to "lock to viewport" when the page lives inside a padded container.** `h-screen` (= 100dvh) inside `<main className="... pt-X pb-Y">` overflows by `X+Y` — the body scrolls and content below the fold gets clipped. Compute the page's height against the actual available viewport: `h-[calc(100dvh-Xrem)]` (and add a responsive variant if the parent's padding changes at a breakpoint).
- **Don't put `box-shadow` + `border-radius` on a child of an `overflow-hidden` wrapper.** The wrapper clips the child's shadow and rounded corners can look squashed at the clip edge — the panel reads as pasted on with hard edges. Move the visual look (bg/border/radius/shadow) onto the wrapper itself; an element's *own* shadow isn't clipped by its own overflow.

## File map (cheat sheet)

- `packages/backend/src/index.ts` — Hono app, route mounting, startup, shutdown handlers
- `packages/backend/src/lib/validate.ts` — Zod wrapper that keeps `{ error, message }` shape
- `packages/backend/src/lib/types.ts` — `toUser` / `toTeam` / `toTask` / `toInvitation` snake_case mappers
- `packages/backend/src/lib/logger.ts` — tiny timestamp-free logger (`✓ Connected to database`, `[GET] /api/me → 200 (3ms)`)
- `packages/backend/src/lib/jwt.ts` — `jose` HS256 sign/verify, `mokara_token` cookie helpers
- `packages/backend/src/routes/{auth,teams,invitations,tasks,comments}.ts` — all API routes
- `packages/frontend/lib/api.ts` — typed client (`Task`, `Team`, `TeamInvitation`, `User`); `isApiError` requires `{ error, message, status }`
- `packages/frontend/lib/cn.ts` — `clsx + twMerge`
- `packages/frontend/app/(app)/tasks/page.tsx` — task list + new-task modal (~1400 lines, the bulk of the FE)
- `packages/frontend/instrumentation.ts` — Next.js server-side health-check pings
- `packages/db/prisma/schema.prisma` — `User`, `Team`, `TeamMember`, `TeamInvitation`, `Task`
- `packages/db/prisma/migrations/` — apply with `pnpm db:migrate:deploy`, generate client with `pnpm db:generate`
- `.github/workflows/ci.yml` — typecheck + lint + format on `dev` branch
- `.prettierrc` / `.prettierignore` — Prettier config
- `.pi/AGENTS.md` — this file
