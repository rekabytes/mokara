---
name: mokara-architecture
description: Plan or review Mokara architecture, folder placement, module boundaries and scoped refactors across its Next.js frontend, Hono backend/admin and pnpm workspace packages. Use when adding features or splitting modules; visual styling belongs to the surface-specific design skills.
---

# Mokara architecture

Keep ownership clear and changes easy to trace through the existing application. Prefer cohesive feature modules inside the current workspace boundaries. This is a project recommendation, not a claim that one folder structure fits every application.

Resolve paths from the repository root. Read `.pi/AGENTS.md` first for operational constraints and `.pi/memory.md` for decisions; inspect current consumers before proposing moves. Read [research.md](references/research.md) when explaining the rationale or comparing alternatives. Framework guidance informs this skill; repository conventions and the owner's requested scope govern implementation.

## Package ownership

```text
packages/
  frontend/
    app/                   Next routes and route-owned UI/helpers
    components/            Components genuinely shared across routes
    hooks/                 Shared React hooks
    lib/                   Shared client/application helpers and API client
    public/                Static assets
  backend/src/
    index.ts               Composition, middleware order, process lifecycle
    routes/                Hono route groups and route-specific helpers
    middleware/            Request-wide concerns
    lib/                   Named business policies, integrations and helpers
    env.ts                 Backend runtime configuration contract
    db.ts, redis.ts         Runtime connection ownership
  backend/test/            Existing isolated backend tests
  admin/src/               Operator HTML/assets, session gate and API proxy
  db/prisma/               Schema, migrations and generated Prisma client
  redis/src/               Redis client factory
```

This map describes responsibilities, not a mandate to create missing directories or relocate existing entrypoints. Existing `index.ts` package entrypoints remain valid; the no-barrels convention prohibits new re-export aggregators, not necessary runtime entrypoints.

- Frontend calls the backend through the same-origin `/api` proxy and `lib/api.ts`. Keep runtime upstream configuration on the server. Do not import Prisma, backend internals or provider secrets into browser modules, or create a second business API in Next route handlers/Server Actions by default.
- Backend owns authorization, business mutations, provider integration and serialization. DB/Redis packages provide infrastructure; they do not import frontend, admin or backend feature modules.
- Admin owns operator presentation and proxy/session handling. Keep database access and Stripe/provider credentials in the backend. Preserve its separate deployment and authentication boundary.
- Use workspace package imports for intentional cross-package dependencies, with `workspace:*` declarations where appropriate. Avoid reaching into another application's source tree. A new shared package needs demonstrated consumers and a coherent public contract; one repeated type alone rarely justifies a package.

## Choose a file's home

Use the narrowest common owner of its actual consumers:

| Responsibility                                            | Placement                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| One frontend route's component, formatter, model or hook  | Beside that route's `page.tsx`, using `./` imports                        |
| Shared frontend JSX                                       | `frontend/components/`, using `@/` imports                                |
| Shared non-React helper or data                           | `frontend/lib/`                                                           |
| Shared stateful React hook                                | `frontend/hooks/`                                                         |
| Request validation schema                                 | Existing backend `lib/validation.ts`                                      |
| One backend route's support helper                        | Beside the route; follow `routes/admin-support.ts` as a placement example |
| Business policy/integration used across routes or workers | Named backend `lib/` module                                               |
| Schema change                                             | `db/prisma/schema.prisma` and a new chronological migration               |

Keep frontend feature internals out of global `components/` merely because they render JSX. Promote a module when another route truly needs the same contract, rather than importing sibling route internals. A genuinely shared subtree may own a local helper when that matches existing conventions.

Name single-primary-component files `PascalCase.tsx`; helpers and multi-export modules use descriptive kebab-case. Preserve existing names unless renaming is part of the task. Avoid new generic `utils.ts`, `common/`, duplicate service wrappers and barrel files. Do not introduce a parallel `features/`, `services/`, or repository layer solely to match a tutorial.

## Frontend boundaries

Keep route pages focused on composition; separate substantial UI and pure transformations along responsibility boundaries, not arbitrary line limits. For example, a task-only export panel and export formatter belong beside `tasks/page.tsx`; an account control used by login and settings belongs in shared components.

Keep static rendering server-side where practical and interactive boundaries small. Follow the repo's directive convention: modules that own hooks, motion or portals declare `"use client"`; inert primitives need no redundant directive. Imports below a client boundary still enter the client graph, so inspect transitive imports for server-only code. Do not convert the existing authenticated client state architecture to server fetching as an incidental cleanup.

Reuse `lib/api.ts`, `api-types.ts`, the established response mappers, `errors.ts` and `useAsyncError`. Preserve snake_case wire contracts and existing consumers. Shared session/application state follows the existing Jotai model; temporary form/menu state stays local. Do not duplicate session probes or atom instances during a file split.

## Backend boundaries

Compose Hono route groups with `app.route()` and keep typed handlers with their route definitions where possible. Extract coherent business operations or pure calculations when complexity or reuse warrants it; avoid controller/service/repository chains that only forward arguments. Direct Prisma use in a small handler is acceptable under current conventions.

For each endpoint, trace validation, authentication, scope authorization, business policy, persistence and response mapping. Follow existing precedence when multiple checks fail; check access before revealing resource existence. Reuse `plans.ts`, `entitlements.ts`, scope helpers and DB constraint mapping rather than creating competing policy sources.

Keep related writes atomic; back race-sensitive rules with appropriate DB constraints or conditional writes. Keep external provider calls out of open DB transactions. For delivery that must survive retries, extend existing inbox/outbox, idempotency and worker patterns rather than launching untracked background promises. Preserve auth/webhook/admin middleware registration order when extracting routes.

## Make a scoped change

Before editing, identify the user-visible behavior, consumers, dependency direction and persistence effects. For a significant boundary decision, explain the proposed ownership and tradeoff briefly; record lasting decisions in existing project docs when warranted. A folder decision alone does not require an ADR.

Move one coherent responsibility at a time. Update imports and remove obsolete copies in the same change. Preserve HTTP paths, cookie/session behavior, serialization, environment contracts, migration history and UI behavior unless the request changes them. Do not relocate the whole repository as a side effect of adopting this skill.

Validate proportional to the change: inspect the import graph for cycles/server leaks, run relevant typechecks and formatting/lint, and use focused tests for changed authorization, transactions or retry behavior. Check routes and workspace exports after moves; follow the fresh-checkout check in `.pi/AGENTS.md` for routing/assets. Documentation-only skill changes need skill validation and link/path checks, not application builds. Follow owner-managed server and CI rules; adding this skill does not authorize commits, pushes, deployments or live mutations.
