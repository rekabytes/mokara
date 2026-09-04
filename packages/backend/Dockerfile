# syntax=docker/dockerfile:1
# mokara backend — Hono on @hono/node-server, Prisma 7 with the pg driver adapter.
#
# Stage layout follows jejak-athlete's backend Dockerfile, including the part
# that matters most: **the container runs the TypeScript source through `tsx`
# instead of shipping compiled output.** See packages/backend/tsconfig.json for
# why compilation is not an option here (Prisma's generator emits a `.ts` client
# that plain Node cannot import from a `@mokara/db/...` package subpath, and
# `allowImportingTsExtensions` forbids emitting at all).
#
# Build from the REPO ROOT:
#   docker build -f packages/backend/Dockerfile -t mokara-backend .

# ---- base: Node + the package manager the lockfile was written with ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

# ---- deps: install from manifests only, so a source edit never re-resolves ----
# Same as the reference project: a FULL install (dev deps included), no --filter.
# That is what makes `prisma` — a devDependency of @mokara/db — available to
# start.sh's `migrate deploy` at run time, and it keeps this stage free of pnpm's
# modules-purge prompt (a --prod/--filter install can trigger it, and with no TTY
# in a container it aborts the build).
#
# Only the manifests the backend's dependency tree needs are copied; the build
# stage then drops in source, and the runner copies /app + /app/packages whole.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/backend/package.json packages/backend/
COPY packages/db/package.json packages/db/
COPY packages/redis/package.json packages/redis/
RUN pnpm install --frozen-lockfile

# ---- build: generate the Prisma client into packages/db/prisma/generated ----
# No DATABASE_URL is needed: prisma.config.ts reads `process.env.DATABASE_URL ??
# ""`, so `generate` is satisfied without the placeholder the reference project
# has to pass. The real URL only arrives at run time.
#
# There is no `tsc` build step, unlike the reference: see tsconfig.json — the
# source imports with `.ts` extensions, which TypeScript refuses to emit, and
# Prisma's client is .ts anyway. The container runs the same source through tsx.
FROM deps AS build
COPY packages/db packages/db
COPY packages/redis packages/redis
COPY packages/backend packages/backend
RUN pnpm --filter @mokara/db generate

# ---- runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4700

# node_modules and the workspace packages both come from the build stage, so the
# `node_modules/@mokara/db` symlink still resolves to a real, generated-client-
# carrying packages/db. Copying only one of the two is how this image breaks.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

# start.sh is the CMD, so it must be executable in the image (a git checkout
# normally preserves the +x bit, but a tarball context would not).
RUN chmod +x /app/packages/backend/scripts/start.sh

USER node
EXPOSE 4700

# /health answers without touching the database (see routes + the request log
# skip), so this reports "the process is serving" and a DB outage shows up as a
# failing dependency instead of a dead container being restarted in a loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const p=process.env.PORT||4700;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run here, not in CI: idempotent, forward-only, and it means a
# container can never come up against a schema it does not expect.
CMD ["/app/packages/backend/scripts/start.sh"]
