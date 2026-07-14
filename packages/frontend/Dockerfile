FROM node:24.18.0-alpine3.24
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile --filter @mokara/frontend...
COPY packages/frontend packages/frontend
WORKDIR /app/packages/frontend
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
