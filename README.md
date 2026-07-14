# Mokara — Task Management (v1)

Basic task management web app. pnpm workspace monorepo: Go (Gin) backend, Prisma-managed `db` package (schema + migrations), Next.js (TypeScript) frontend. PostgreSQL + Redis run in Docker; backend and frontend run on the host for fast dev loops.

See [`docs/development/PRD-01.md`](docs/development/PRD-01.md) for the full spec.

## Structure

```
mokara/
├── docker-compose.yml     # postgres + redis ONLY
├── pnpm-workspace.yaml
├── packages/
│   ├── backend/           # Go + Gin REST API (pgx + raw SQL)
│   ├── db/                # Prisma: schema.prisma, migrations, seed
│   └── frontend/          # Next.js (TypeScript) UI
```

## Prerequisites

Install these (WSL Ubuntu recommended, since the project lives there):

- **Go** 1.26+ — <https://go.dev/dl/>
- **Node.js** 24+ and **pnpm** 11.13 — `npm i -g pnpm@11.13.0` (or Corepack)
- **Docker** + Docker Compose

## Getting started

### 1. Start infrastructure (PostgreSQL + Redis only)

```bash
docker compose up -d
```

### 2. Set up the database (Prisma)

```bash
cp packages/db/.env.example packages/db/.env
pnpm install               # installs Prisma (db) + frontend deps
pnpm db:migrate:init       # first run: creates the `init` migration + `tasks` table
pnpm db:generate           # generates the Prisma 7 client
pnpm db:seed               # inserts sample tasks
```

After the initial migration is committed, applying it elsewhere uses `pnpm db:migrate:deploy`.
To change the schema: edit `packages/db/prisma/schema.prisma`, then run `pnpm db:migrate` (creates a new migration).

### 3. Run the backend (Go + Gin)

```bash
cd packages/backend
cp .env.example .env
go mod tidy        # first run only
go run .
# -> http://localhost:8080  (try /health and /api/tasks)
```

### 4. Run the frontend (Next.js)

```bash
cd packages/frontend
cp .env.example .env
pnpm dev
# -> http://localhost:3000
```

## API

| Method | Path              | Description                       |
|--------|-------------------|-----------------------------------|
| GET    | `/api/tasks`      | List tasks (`?status=todo`, etc.) |
| GET    | `/api/tasks/:id`  | Get one task                      |
| POST   | `/api/tasks`      | Create a task                     |
| PATCH  | `/api/tasks/:id`  | Update a task (partial)           |
| DELETE | `/api/tasks/:id`  | Delete a task                     |

## Notes

- **DB schema + migrations** are managed by **Prisma 7** in `packages/db`. Schema lives in `prisma/schema.prisma`; CLI config (datasource URL, migrations, seed) lives in `prisma.config.ts`. The generated client (`prisma generate`) outputs to `prisma/generated/` (gitignored). The Go backend does **not** use the Prisma client — it queries via `pgx` + raw SQL against the columns Prisma creates. Migrations use `prisma migrate` (`migrate dev` locally, `migrate deploy` to apply). Seed runs via `tsx prisma/seed.ts`.
- **Redis** is provisioned in Docker but unused in v1 (reserved for sessions/cache/rate-limiting).
- Package Dockerfiles use the repository root as their build context:
  - `docker build -f packages/backend/Dockerfile -t mokara-backend .`
  - `docker build -f packages/frontend/Dockerfile -t mokara-frontend .`
  They are intentionally **not** wired into `docker-compose.yml`.
- Per-package `.env` files are gitignored; only `.env.example` is committed.
