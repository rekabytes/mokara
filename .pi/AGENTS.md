# Mokara — Memory

## Facts

- pnpm workspace monorepo: `@mokara/frontend` (Next 16.2.10), `@mokara/backend` (Hono 4.12), `@mokara/db` (Prisma 7.8).
- Node ≥24, pnpm 11.13. Postgres 16 + Redis 7 via `docker-compose.yml`.
- Backend on :4200, frontend on :4201. `NEXT_PUBLIC_API_BASE_URL` points to backend.
- Auth: HS256 JWT in `mokara_token` httpOnly cookie (name shared with `proxy.ts` route guard). bcryptjs (cost 10); Go-format `$2a$` hashes are compatible.
- DB has trigger `enforce_max_team_members` (3-member cap, raises `team_full`) and partial unique index `team_invitations_team_pending_unique` — backend maps both to friendly 409s.
- API error contract: `{ error: <code>, message: <text> }`. Zod errors go through `lib/validate.ts` wrapper to keep that shape (frontend `isApiError` requires both keys).

## Decisions

- 2026-08-18: Replaced Go+Gin backend with Hono+TS. JSON shapes and cookie name unchanged so frontend stays untouched. Reason: shared TS stack, faster iteration, single language across the monorepo.
- 2026-08-18: Skipped `ioredis` (in global reference). Reason: no caching use case yet; add when one appears.
- 2026-08-18: Did not migrate `useSession` to jotai or replace `DateRangePicker` with `react-day-picker`. Reason: refactors, not dependency updates.
- 2026-08-18: Combined root `dev` uses `pnpm -r --parallel --filter ... run dev` (not `&`). Reason: portable across platforms.
- 2026-08-18: Added `tailwind-merge` to `cn()` helper. Reason: matches global Next.js reference; dedupes conflicting Tailwind utilities.
- 2026-08-18: Added ESLint 9 flat config to frontend. Reason: matches global reference; was missing.

## Conventions

- Response shape: snake_case JSON decoupled from Prisma's camelCase models via `lib/types.ts` mappers (`toUser`, `toTeam`, `toTask`, etc.).
- Workspace import: backend uses deep path `@mokara/db/prisma/generated/client` (db package has no `exports` field).
- Cookie auth: `Secure` flag only in `ENV=production`. SameSite=Lax, Path=/, HttpOnly.
- Postgres trigger / partial-index errors are matched on message string (`"team_full"`, `"team_invitations_team_pending_unique"`) — robust to adapter wrapping.
- **Never run `pnpm dev` / `next dev` / any foreground server command here** — the user starts their own dev servers. Use typecheck, lint, test, build, migrate, seed for verification. Short curl probes against a server the user already started are fine.
