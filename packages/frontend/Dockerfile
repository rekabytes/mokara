# syntax=docker/dockerfile:1
# mokara frontend — Next 16, standalone output.
#
# Stage layout follows jejak-athlete's frontend Dockerfile; the deltas are
# documented in docs/development/PRD-07.md §7.
#
# Build from the REPO ROOT (the context must contain pnpm-workspace.yaml):
#   docker build -f packages/frontend/Dockerfile -t mokara-frontend .
#
# There is no NEXT_PUBLIC_* build arg here on purpose. The browser calls
# same-origin /api/… and app/api/[...path]/route.ts proxies it to BACKEND_URL at
# runtime, so nothing about the deployment host is baked into this image — which
# is the entire point of publishing an image to pull rather than building on the
# server.

# ---- base: Node + the package manager the lockfile was written with ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

# ---- deps: install from manifests only, so a source edit never re-resolves ----
# Same as the reference project: copy every workspace manifest and run a plain
# install, so the build environment is identical to dev no matter which packages
# the frontend imports from later. The runner never sees these node_modules — it
# copies only .next/standalone + .next/static, so dev deps here cost image size
# in the build cache, not in the published image.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

# ---- build: .next/standalone + traced workspace files ----
FROM deps AS build
COPY packages/frontend packages/frontend
WORKDIR /app/packages/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runner: no pnpm, no node_modules install, no toolchain ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4701
# HOSTNAME must be explicit. The standalone server reads process.env.HOSTNAME,
# and a container runtime sets that to the container id — binding to it works
# only if that name resolves, so pin it to all interfaces instead.
ENV HOSTNAME=0.0.0.0

# standalone is rooted at the repo root (outputFileTracingRoot), so the server
# lands under packages/frontend/ rather than at the image root.
COPY --from=build --chown=node:node /app/packages/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/packages/frontend/.next/static ./packages/frontend/.next/static
# public/ holds the landing-page imagery. Without this copy the files exist in
# dev but 404 in production only.
COPY --from=build --chown=node:node /app/packages/frontend/public ./packages/frontend/public

USER node
EXPOSE 4701

# Any answer below 500 proves the server process is up and routing — / is a
# redirect and protected pages answer 307, so requiring 2xx would report a
# healthy container as unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const p=process.env.PORT||4701;fetch('http://127.0.0.1:'+p+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/frontend/server.js"]
