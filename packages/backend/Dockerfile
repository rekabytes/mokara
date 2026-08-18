# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build
WORKDIR /app

# Install pnpm via corepack
RUN corepack enable

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/db/package.json ./packages/db/

# Install only the backend (and db for Prisma client) — keeps image lean.
# Prisma needs allowBuilds set in pnpm-workspace.yaml (already configured).
RUN pnpm install --frozen-lockfile --filter @mokara/backend... --filter @mokara/db...

# Copy sources
COPY packages/backend ./packages/backend
COPY packages/db ./packages/db

# Generate Prisma client and compile backend
RUN pnpm --filter @mokara/db generate
RUN pnpm --filter @mokara/backend build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache ca-certificates
ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/packages/backend/package.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 4200
CMD ["node", "dist/index.js"]
