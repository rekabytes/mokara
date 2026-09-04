#!/bin/sh
# Production startup sequence for the backend container.
#
# `set -e` so a failed migration never lets the server come up and start
# answering with a schema it does not have.
#
#   1. prisma migrate deploy — idempotent, forward-only, applies anything
#      pending. Run from packages/db so the CLI auto-discovers prisma.config.ts
#      (which resolves DATABASE_URL relative to that package).
#   2. exec tsx src/index.ts — the container runs the same TypeScript source dev
#      runs. tsc cannot emit here at all: the source imports with `.ts`
#      extensions (which forbids emit) and Prisma's generator produces a `.ts`
#      client that plain Node cannot import from a package subpath. See
#      tsconfig.json for the long version.
#
# `exec` replaces this shell with the server process, so SIGTERM from the
# container runtime reaches Hono's own graceful-shutdown handler instead of
# killing a PID-1 shell.
#
# Both `prisma` and `tsx` are reached through their owning package's
# node_modules/.bin: pnpm's layout does not reliably hoist them to
# /app/node_modules/.bin.
#
# No seed step: unlike the reference project, mokara's `prisma db seed` creates
# demo users and tasks, so it stays a local-only command (`pnpm db:seed`).

set -e

echo "[start] applying database migrations… (forward-only: pending ones are applied, already-applied ones are skipped — nothing is deleted)"
cd /app/packages/db && ./node_modules/.bin/prisma migrate deploy

echo "[start] launching backend…"
cd /app
exec ./packages/backend/node_modules/.bin/tsx packages/backend/src/index.ts
