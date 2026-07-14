# PRD-01: Task Management Web App (v1 — Basic)

**Status:** In Progress
**Owner:** TBD
**Last updated:** 2026-07-15

---

## 1. Overview

A basic task management web application built as a pnpm workspace monorepo. The goal of v1 is to deliver a minimal but working task CRUD experience end-to-end (frontend → API → database), with a clean, reproducible local development setup.

The architecture is intentionally simple. PostgreSQL and Redis run in Docker; the backend (Go) and frontend (Next.js) run directly on the host during development for fast hot-reload loops.

## 2. Goals

- Deliver a minimal task management experience (create, read, update, delete tasks).
- Establish a clean pnpm workspace monorepo with `backend`, `db`, and `frontend` packages.
- Provide a reproducible local dev environment via Docker (infra only).
- Keep each package self-contained with its own `Dockerfile` and `.env` for easy, isolated configuration.

## 3. Out of Scope (v1)

- Authentication / authorization / multi-user.
- Real-time collaboration or live sync.
- Notifications, email, or webhooks.
- Mobile/native clients.
- Production deployment / CI/CD pipelines.
- Advanced features: projects, labels, subtasks, comments, attachments, search.

> Redis is provisioned in Docker so it is available, but has **no functional use in v1**. It is reserved for future work (sessions, caching, rate limiting).

## 4. Core Features (Basic)

| # | Feature | Description |
|---|---------|-------------|
| F1 | Create task | Add a task with title (required) + optional description, priority, due date. |
| F2 | List tasks | View all tasks, sorted by created time (newest first). |
| F3 | Filter tasks | Filter by status (`todo`, `in_progress`, `done`). |
| F4 | Update task | Edit title, description, status, priority, due date. |
| F5 | Toggle status | Quick action to mark a task done / not done. |
| F6 | Delete task | Remove a task. |

## 5. Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Frontend | Next.js (App Router) + TypeScript |
| Backend | Go (HTTP API) |
| API framework | Gin |
| Database | PostgreSQL |
| DB schema & migrations | Prisma 7 (Prisma Migrate + `prisma.config.ts`) |
| Cache (provisioned, unused in v1) | Redis |
| Infra (local) | Docker + Docker Compose |

## 6. Project Structure

```
mokara/
├── package.json                 # workspace root
├── pnpm-workspace.yaml
├── docker-compose.yml           # postgres + redis ONLY
├── .gitignore
├── packages/
│   ├── backend/                 # Go API
│   │   ├── go.mod
│   │   ├── main.go
│   │   ├── Dockerfile
│   │   ├── .env                 # backend-specific (DB_DSN, PORT, etc.)
│   │   └── .env.example
│   ├── db/                      # Prisma 7 (schema + migrations source of truth)
│   │   ├── package.json
│   │   ├── prisma.config.ts     # CLI config (datasource URL, migrations, seed)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   ├── generated/       # prisma-client output (gitignored)
│   │   │   └── migrations/
│   │   ├── .env                 # db-specific (DATABASE_URL)
│   │   └── .env.example
│   └── frontend/                # Next.js (TypeScript)
│       ├── package.json
│       ├── Dockerfile
│       ├── .env                 # frontend-specific (API_BASE_URL, etc.)
│       └── .env.example
```

### Package responsibilities

- **`packages/backend`** — Go HTTP API. Owns connection to PostgreSQL. Exposes REST endpoints. Queries via `pgx` + raw SQL (does not use a Prisma client; Prisma's client is TS-only).
- **`packages/db`** — Source of truth for the database schema and migrations, managed by **Prisma** (`prisma/schema.prisma`, `prisma/migrate`). Also holds a seed script. The backend reads the resulting tables directly.
- **`packages/frontend`** — Next.js TypeScript UI. Talks to the backend API over HTTP.

## 7. Infrastructure (Docker)

### 7.1 `docker-compose.yml` behavior

Running `docker compose up -d` starts **only** the data/infra services:

- `postgres` (PostgreSQL)
- `redis`

It does **not** start the backend or frontend. This keeps the dev loop fast and lets each service run on the host with hot-reload.

### 7.2 Per-package Dockerfiles

Each runnable package has its own `Dockerfile` (used later for containerized builds / production), and its own `.env` so configuration stays scoped and easy to track:

- `packages/backend/Dockerfile` + `.env`
- `packages/frontend/Dockerfile` + `.env`

Each package also ships a `.env.example` that is committed; real `.env` files are gitignored.

## 8. Development Workflow

```bash
# 1. Start infra (postgres + redis) only
docker compose up -d

# 2. Database — create migrations + seed (run from repo root)
cp packages/db/.env.example packages/db/.env
pnpm install
pnpm db:migrate:init   # first run: creates + applies the `init` migration
pnpm db:seed

# 3. Backend — run from its folder
cd packages/backend
cp .env.example .env   # first time only
go run .

# 4. Frontend — run from its folder
cd packages/frontend
cp .env.example .env   # first time only
pnpm dev
```

## 9. Data Model (Basic)

Single table for v1.

### `tasks`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `title` | `text` | NOT NULL | Required |
| `description` | `text` | nullable | |
| `status` | `text` | NOT NULL, default `'todo'` | `todo` \| `in_progress` \| `done` |
| `priority` | `text` | NOT NULL, default `'medium'` | `low` \| `medium` \| `high` |
| `due_date` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Backend sets `now()` on update |

Schema and migrations are managed by **Prisma** in `packages/db/prisma/schema.prisma`.

## 10. API (Basic, REST)

Base URL configured via frontend `.env` (e.g. `http://localhost:8080/api`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks. Optional query: `?status=todo` |
| `GET` | `/api/tasks/:id` | Get a single task |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/:id` | Update a task (partial) |
| `DELETE` | `/api/tasks/:id` | Delete a task |

All responses are JSON. Standard HTTP status codes.

## 11. Frontend (Basic)

- Single primary page: **`/`** — task list with a create form.
- Filter control for status.
- Each task row: inline edit (or modal), status toggle, delete.
- Talks to backend via `API_BASE_URL` from `.env`.

## 12. Open Questions / Assumptions

1. **Backend framework — RESOLVED:** **Gin**.
2. **Auth in v1?** Assumed **none** (single-user, no login). Confirm.
3. **`packages/db` ownership — RESOLVED:** Managed by **Prisma 7** (`schema.prisma` + `prisma.config.ts` + Prisma Migrate). The Go backend does not use a Prisma client; it queries via `pgx` + raw SQL against the columns Prisma creates.
4. **Redis.** Provisioned but unused in v1. Confirm this is acceptable.
