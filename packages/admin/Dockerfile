# syntax=docker/dockerfile:1
# mokara admin — the operator console (Hono on @hono/node-server, run through tsx).
#
# Same shape as packages/backend/Dockerfile, minus everything database-shaped:
# the console holds no DATABASE_URL, has no Prisma client and runs no
# migrations. It proxies every read and write to the backend, so this image
# needs a generate stage for nothing and its start script has one line.
#
# Build from the REPO ROOT (the context must contain pnpm-workspace.yaml):
#   docker build -f packages/admin/Dockerfile -t mokara-admin .
#
# Runtime env (Coolify): BACKEND_URL (the backend's internal address),
# ADMIN_PORT, ADMIN_TOKEN_SECRET and ADMIN_URL_KEY — both shared with the
# backend's .env — plus ENV=production, which turns on the `__Host-` cookie
# prefix, the Secure flag and the boot-time secret-length checks. Forgetting
# ENV=production does not break the login; it leaves the cookie without Secure.

# ---- base: Node + the package manager the lockfile was written with ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

# ---- deps: install from manifests only, so a source edit never re-resolves ----
# Only the console's own manifest is copied: it imports no workspace package
# (no @mokara/db, no @mokara/redis), so nothing else needs to be present.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/admin/package.json packages/admin/
RUN pnpm install --frozen-lockfile

# ---- build: no build. The container runs the TypeScript source through tsx ----
# See packages/admin/tsconfig.json: `allowImportingTsExtensions` forbids
# emitting at all, so `tsc` is the type gate and nothing more — the same posture
# as the backend, minus its Prisma-client complication.
FROM deps AS build
COPY packages/admin packages/admin

# ---- runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    ADMIN_PORT=4702

# node_modules comes from the build stage whole: with shamefullyHoist the tree
# is flat at /app/node_modules, and packages/admin/node_modules/.bin holds the
# tsx binary the start script reaches for.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/admin ./packages/admin
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

RUN chmod +x /app/packages/admin/scripts/start.sh

USER node
EXPOSE 4702

# /health answers without calling the backend (see src/index.ts), so this
# reports "the console process is serving" — a down backend shows up as a 502 in
# the UI rather than a container being restarted in a loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const p=process.env.ADMIN_PORT||4702;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/packages/admin/scripts/start.sh"]
