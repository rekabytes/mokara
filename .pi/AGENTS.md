# Mokara — Agent Instructions

How to work in this repository. Project **facts, decisions and traps** live in
`.pi/memory.md` — read it before non-trivial work; transient progress lives in
`.pi/state.md`. Keep this file to instructions and reference only.

## Stack

- pnpm workspace monorepo: `@mokara/frontend` (Next 16), `@mokara/backend` (Hono), `@mokara/db` (Prisma 7), `@mokara/redis` (ioredis). Node ≥24, pnpm 11.13. Postgres 16 + Redis 7 run in Docker (dev only). Redis is a **hard runtime dependency** of the backend (session revocation): `REDIS_URL` (default `redis://127.0.0.1:6379`), startup ping fails fast, auth middleware fails closed (503) when it is unreachable. Backend :4700, frontend :4701.
- Browser calls same-origin `/api` through the frontend proxy (`BACKEND_URL` at runtime). Auth is an HS256 JWT in the `mokara_token` httpOnly cookie (carries a `jti`; logout writes it to a Redis denylist so a copied cookie dies too); passwords are bcrypt.
- Every API failure is `{ error, message }`; codes are mapped in `packages/frontend/lib/errors.ts` and pages consume them through `hooks/useAsyncError.ts`. API responses are snake_case via `lib/types.ts` mappers. Server input is Zod-validated with strict schemas.

## Commands

- Dev: `pnpm dev` / `dev:backend` / `dev:frontend` (each chains `pnpm db:bootstrap` = migrate deploy + generate). The owner starts dev servers — never you.
- Exit-once gates (the only things you run): `pnpm typecheck` · `lint` · `format` · `db:generate` · `db:migrate:deploy`.
- Reproduce CI's fresh checkout before pushing asset or routing changes: `mv packages/frontend/next-env.d.ts /tmp && pnpm typecheck`, then restore it.

## Hard rules

1. **Never build or run what CI is responsible for** — no `docker build`, no `next build`/`start`/`preview`, no infra containers, no background servers "just to check". CI is the feedback loop; a one-shot check still counts as a build.
2. **Scope: do exactly what was asked, in the phase asked.** No unrequested behavior — especially nothing hidden, filtered or replaced with empty states (render everything, zero-filled). No speculative adjacent changes, no over-engineering, no starting before the owner says go, no guessing at UI feedback — ask.
3. **Git:** one commit per feature, staged by path (`git add .` is a fallback, say so when used). Plain `git commit -m` only — no heredocs, no `-F` with inline prose, and never trigger words (`shutdown`, `exec`, `kill`) anywhere in the command line. Never `--no-verify`, `core.hooksPath` or force flags. **Never push without the owner asking. Never commit without the owner asking either (2026-09-04) — build and leave the tree dirty; the owner commits (or asks) when ready.**
4. **TypeScript: no `as any`, no cast where a type will do.** Name the real type, narrow with `instanceof`, or derive constants. Zero `@ts-ignore` / `@ts-expect-error` / non-null assertions.
5. **Effects: `useEffect` only to sync with something outside React**, each with a comment saying what it syncs; animation is presence-driven (`<AnimatePresence>` owns unmount timing — no timer rigs).

## Code conventions

- State: Jotai atoms for shared/global state (module-level, default store, no `<Provider>`); `useState` only for ephemeral UI. Shared hooks return memoised objects (safe in `useCallback` deps). Session: one `/me` probe per app lifetime; login/signup call `setSessionUser`.
- Motion: framer-motion `^13`; **all constants and variants come from `lib/motion.ts`** — never inline an easing or duration. Portal popovers: `AnimatePresence` wraps the `createPortal` call, and measured positions are never cleared on close. Lists animate `layout="position"` only; the heatmap track/cells and `ChipShell` are off-limits to motion.
- Dates: anchor day math on local midnight (`new Date(y, m, d)`); never derive day indexes from live timestamps or `.toISOString()` round-trips.
- Tailwind/UI: no pseudo-element slide-ins; no `h-screen` inside padded containers (use `h-[calc(100dvh-…)]`); add `min-w-0` to grid/flex children; no box-shadow+radius on a child of `overflow-hidden`; no `calc(50% - 50vw)` bleeds inside grid columns; verify layouts at 1280/1440/1600/1920, never one width; don't assume token contrast — check the CSS var.
- Copy the slim breadcrumb page header **verbatim** between pages (star + size-8 bell included; the bell sets the row height). Dropdowns: `grid-cols-[1fr_18px]`, checkmark-only selection.
- One surface per concern: `components/ErrorBanner.tsx` for block errors, `lib/cn.ts` for class merging, `lib/motion.ts` for motion constants — no private copies.
- Backend: Zod strict schemas in `lib/validation.ts`; Prisma constraint matching through `lib/db-error.ts`; per-route authorisation before existence checks.

## CI & release

- CI on `dev`: install --frozen-lockfile → `db:generate` → typecheck → lint → format → **`build:frontend`** (standalone). Local gates are a subset — CI has the final word.
- Release: bump `version` in **all four** `package.json` files (+ README/PRD-07/release.yml examples) in one `chore(release)` commit → push `dev` → `git fetch --tags` → `git tag -a vX.Y.Z` → push the tag. The release gate compares the tag to the **root** `package.json` and runs the real build + every migration on an empty Postgres; it publishes `ghcr.io/rekabytes/mokara-{backend,frontend}:{version, major.minor, latest}` and creates no GitHub release.

## Where things live

- Backend `packages/backend/src/`: `routes/` (auth, teams, invitations, tasks, comments, analytics, projects, kpis) · `lib/` (validation, types, jwt, cookies, sessions, db-error, container-scope, team-membership, slug, password, logger) · `middleware/` (auth, cors, request-log) · `redis.ts` (connect/disconnect, fail-fast startup).
- Frontend `packages/frontend/`: `app/(app)/` (tasks + drawer, analytics, teams) · `app/(legal)/` (three public documents) · `app/page.tsx` (landing) · `components/` (AppShell, ContainerSwitcher, ErrorBanner, MotionProvider, SiteHeader, SiteFooter, LegalDoc, LegalLinksLine, AmbientCanvas, HeroSplit, Reveal, TiltPanel) · `lib/` (api, errors, session, containers, meta, tasksView, motion, legal, cn) · `hooks/useAsyncError.ts`.
- DB `packages/db/prisma/`: `schema.prisma` + `migrations/`.
- Redis `packages/redis/`: `@mokara/redis` — client factory only (`createRedis`, fail-fast options); denylist keys live in backend `lib/sessions.ts`.
- Docs: `docs/development/PRD-0*.md`, `docs/design/`.
