# Contributing to Mokara

Mokara is a self-hostable task-management app — a pnpm workspace monorepo with a
Hono (TypeScript) backend, a Next.js (TypeScript) frontend, Prisma + PostgreSQL,
and Redis. It is **open-core**: self-hosting is free forever, and the hosted
instance is what subscriptions pay for (see
[`docs/development/PRD-11-subscription-plans.md`](development/PRD-11-subscription-plans.md)).

This guide covers how to get a change from idea to merged on `dev`. The setup
walkthrough lives in [`README.md`](../README.md); this file is the contract.

## Before you write code

1. **Read the relevant PRD** in [`docs/development/`](development/). Feature
   shape, phase gates, and the "done when" criteria live there. If your idea
   isn't in a PRD, open an issue first — the roadmap is maintainer-owned and
   several attractive-sounding features are deliberately deferred (with
   reasons), so "why isn't this here yet?" usually has an answer.
2. **One feature per pull request**, and keep it the size of one commit.
   Drive-by extras — refactors, renames, formatting churn on lines you didn't
   touch — belong in their own PR or nowhere.
3. **Small fixes need no ceremony.** A typo, an obvious bug with a clear
   one-line fix: open the PR directly.

## Dev environment in four lines

```bash
docker compose up -d          # postgres + redis (+ optional minio)
cp packages/backend/.env.example packages/backend/.env   # then fill nothing to start
pnpm install                  # Node ≥ 24, pnpm 11.13
pnpm dev                      # migrates + generates, then backend :4700 + frontend :4701
```

The browser only ever talks to the frontend at :4701; it proxies `/api/*` to
the backend, so there is no CORS and no public API URL to configure. Demo data:
`pnpm db:seed` (users `mira` / `jonas` / `priya`, password `demo-password`).

> `tsx watch` does **not** reload on `.env` edits — restart the backend after
> changing env values.

## Pull request checklist

CI runs on every PR to `dev`: frozen install → `db:generate` → `typecheck` →
`lint` → `format` → real frontend build. Everything except the build is a
local script; run them before you push:

```bash
pnpm typecheck && pnpm lint && pnpm format
```

- **No automated test suite exists yet.** CI's green check plus a described
  manual pass is the bar: put the click-through in the PR body ("created a
  task with a file → thumbnail appears in the drawer → uploader delete →
  reload"). Screenshots for UI changes, please.
- **Prettier and ESLint are the style authority.** If `pnpm format` complains,
  `pnpm format:fix`. Don't fight the config.
- **Migrations:** see below — they are hand-written here.

## Conventions that are not negotiable

### Backend

- Input is validated with **strict Zod schemas** in
  `packages/backend/src/lib/validation.ts`. Every failure is
  `{ error: <code>, message }`; codes are mapped in
  `packages/frontend/lib/errors.ts` (`ERROR_RULES`). A new error code is not
  done until it has an `ERROR_RULES` entry — one error map, no private copies.
- **Authorisation before existence.** A route answers 403 "not a member"
  before it ever reveals that a row exists.
- Responses are snake_case, built by the mappers in `lib/types.ts`. Never
  return raw Prisma objects.
- **Degrade honestly when config is missing.** Attachments without a bucket
  answer `attachments_disabled`; billing without Stripe env answers
  `billing_not_configured`; self-hosted reads every cap as unlimited. A
  missing optional feature must never take the rest of the app down — and
  must never fake success.
- `GET /health` deliberately does not ping dependencies. Leave it alone.
- The Stripe webhook (`POST /api/billing/webhook`) is the only public
  mutating route; its signature check is its auth. `users.plan` is written
  by the webhook and the sync endpoint **only** — never by a client redirect.

### Database

- Migrations are **hand-written SQL** in `packages/db/prisma/migrations/`
  (`prisma migrate dev` hangs interactively in this setup — don't use it).
  Verify with `pnpm db:migrate:deploy` against a local Postgres, and name
  directories `<YYYYMMDDHHMMSS>_<slug>`.
- Values that look like enums are `TEXT` + a `CHECK` constraint (see
  `users_plan_check`, `attachments_owner_check`). There are no Prisma enums.
- After editing `schema.prisma`: `pnpm db:generate` (also runs via
  `db:bootstrap` on every dev start).

### Frontend

- Shared state is **Jotai module-level atoms on the default store** — no
  `<Provider>`. `useState` is for ephemeral UI only. Data fetching lives in
  `useEffect` only when it syncs something outside React (timers, listeners,
  server reads), and each such effect carries a comment saying what it syncs.
- Animations are **presence-driven**: `<AnimatePresence>` owns unmount timing
  — no `setTimeout`/rAF exit rigs — and every duration/easing/variant comes
  from `lib/motion.ts`.
- API calls go through `lib/api.ts` (`req()` / `uploadViaXhr`) and failures
  through `hooks/useAsyncError.ts` (`const x = await run(...); if (!x)
return;`). No stray `fetch`.
- **No emoji in the UI.** Icons are hand-drawn inline SVGs
  (`viewBox="0 0 24 24"`, `stroke="currentColor"`, `aria-hidden`), defined
  per file like the ones already there. There is no icon library.
- TypeScript: no `as any`, no casts where a named type will do, zero
  `@ts-ignore` / `@ts-expect-error` / non-null assertions.
- Date math anchors on **local midnight** (`new Date(y, m, d)`) — never day
  indexes from live timestamps or `.toISOString()` round-trips.
- Layout gotchas we've already paid for: `min-w-0` on grid/flex children,
  no `h-screen` inside padded containers, and verify at 1280/1440/1600/1920
  — never a single width.

### Security posture

The frontend ships an **enforced same-origin CSP** (`default-src 'self'`).
Anything that adds a third-party script, font, image host, or API origin
breaks the app — those need a maintainer conversation first. Auth is an
httpOnly JWT cookie; there is no token in localStorage, and there must not
be: the published cookie policy promises no client-side storage.

## Dependencies

Do not add or bump dependencies casually. A PR that introduces a package
needs a one-paragraph justification in the body (what it replaces, why hand-
rolling isn't worth it). Workspace-wide pins: Node ≥ 24, pnpm 11.13, Next 16,
Prisma 7, framer-motion 13.

## Commits & branches

- Branch from `dev`; PRs merge into `dev`. `main` is the stable branch, kept
  current by merging `dev` into it — contributors never target `main` directly.
  Releases are cut from `dev` by a `v*.*.*` tag (the maintainer's step).
- One commit per feature, staged by path. Message style follows the history:
  `feat(scope): …`, `fix(scope): …`, `chore(release): x.y.z` — short, plain.
- Never commit secrets, Stripe object ids, account identifiers, or anything
  from `.env` files. `.env.example` documents every env var with comments;
  keep it in sync when you add one.

## What won't be merged

- Features outside a PRD that never got an approved issue.
- Legal document edits (`app/(legal)/`) — the wording is deliberate and
  jurisdiction-checked.
- Client-side storage of any kind (see cookie policy above).
- UI emoji, icon libraries, or motion constants outside `lib/motion.ts`.
- Formatting or naming sweeps unrelated to a fix.
- Anything that makes `DEPLOY_MODE=self_hosted` depend on a network call —
  open-core means zero phone-home.

## Questions

Open an issue. Maintainers review PRs to `dev` as time allows; a friendly
nudge after a week is fine, a re-push of an empty PR is not.

Thanks for reading this far — the checklist above is exactly what reviewers
will run your change against.
