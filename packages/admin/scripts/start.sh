#!/bin/sh
# Production startup for the admin console container.
#
# One line, because there is nothing to prepare: no migrations (the console has
# no DATABASE_URL — every read and write is proxied to the backend), no Prisma
# generate, no build output. The container runs the same TypeScript source dev
# runs, through tsx.
#
# `exec` replaces this shell with the server process, so SIGTERM from the
# container runtime reaches the app's own handler (src/index.ts) instead of
# killing a PID-1 shell.
#
# tsx is reached through this package's own node_modules/.bin — pnpm's layout
# does not reliably hoist it to /app/node_modules/.bin.

set -e

echo "[admin-start] launching the operator console…"
cd /app/packages/admin
exec ./node_modules/.bin/tsx src/index.ts
