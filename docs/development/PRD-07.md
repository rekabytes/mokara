# PRD-07 — Tagged Releases: Frontend + Backend Docker Images for Coolify

**Status:** Implemented 2026-09-03. The §9 decisions were resolved by following the
reference repo rather than answered one by one: same-origin proxy, `tsx` in the
container, migrations in `start.sh`, ports = dev ports, strict `v*.*.*` trigger. GHCR
public/private remains deferred by the owner (§8.1 applies if the packages stay
private).
**Owner intent:** pushing a tag `vX.Y.Z` builds and publishes two Docker images;
the Coolify host pulls them. No building on the server.

**Reference implementation:** `jejak-athlete` (`.github/workflows/release.yml`,
`packages/{frontend,backend}/Dockerfile`, `packages/frontend/app/api/[...path]/route.ts`,
`packages/backend/scripts/start.sh`). Same stack — pnpm monorepo, Next
standalone, Hono + Prisma 7, GHCR, Coolify — so that project is adopted as the
pattern rather than re-deriving one. Where this PRD deliberately differs from it,
§7 says so and why.

---

## 1. Goal

`git tag v0.1.0 && git push origin v0.1.0` produces:

- `ghcr.io/<owner>/mokara-frontend:0.1.0` (+ `:0.1`, `:latest`, `:main-<sha>`)
- `ghcr.io/<owner>/mokara-backend:0.1.0` (+ same)

Coolify runs both as **Docker Image** services. Upgrade = new tag; rollback =
redeploy the previous tag.

## 2. Non-goals

Multi-arch beyond amd64, blue/green or zero-downtime deploys, DB rollback,
preview environments per PR, CDN/edge caching, and any change to the app's data
model or API contract.

---

## 3. Three blockers, all verified by running them

### 3.1 The backend has no working production build

`pnpm build:backend` fails:

```
tsconfig.json(13,35): error TS5096: Option 'allowImportingTsExtensions' can only be
used when either 'noEmit' or 'emitDeclarationOnly' is set.
```

`packages/backend/tsconfig.json` sets `allowImportingTsExtensions: true` (the source
imports `./env.ts` with extensions) **and** `outDir`/`noEmit: false`. TypeScript
refuses that combination, so `tsc` cannot emit. CI cannot see it: `pnpm typecheck`
runs `tsc --noEmit`, which is legal. **The artifact the image needs has never been
built successfully.**

Fixing the tsconfig is not enough either. With `rewriteRelativeImportExtensions: true`
tsc emits and rewrites `./env.ts` → `./env.js`, but `node dist/index.js` then dies
on the workspace import:

```
ERR_MODULE_NOT_FOUND: Cannot find module '…/@mokara/db/prisma/generated/client'
```

Prisma's generator is `provider = "prisma-client"` with `importFileExtension = "ts"`,
so that module is a **`.ts` file**, which plain Node cannot import from a package
subpath.

**The reference's answer, which we adopt:** don't ship compiled output at all —
ship the TypeScript and run it with `tsx` in the container (`exec tsx src/index.ts`),
exactly as dev does. `tsc` keeps its job as the type gate (`--noEmit`), which is what
CI already runs. Verified here too: an esbuild bundle of `src/index.ts` boots and
reaches the database, so bundling is a valid **later** optimisation (§7.4) — but `tsx`
is what matches the reference and needs no new tool.

### 3.2 `tsx` must be a runtime dependency

`packages/backend/package.json` lists `tsx` under `devDependencies`, so a `--prod`
install produces an image with no way to start. **`tsx` moves to `dependencies`** —
the reference does the same (`tsx` is a dependency of `@jejak/backend`). `prisma`, by
contrast, stays a devDependency of `@mokara/db`, matching the reference, because the
runner image ships a dev-included `node_modules` (§5.2, §7).

### 3.3 The frontend image is fat, and its API URL is build-time

`packages/frontend/Dockerfile` is single-stage: it installs every dependency
including dev, builds, and keeps `node_modules` + `.next`, then `CMD ["pnpm","start"]`
— which needs the package manager at runtime. There is no `output: "standalone"`.

**Verified:** adding `output: "standalone"` works with this workspace —
`.next/standalone` is 39 MB, and `PORT=4321 node packages/frontend/server.js`
served `/login → 200` and `/tasks → 307` (the `proxy.ts` guard still fires). Note
mokara has **no `public/` directory**, so the reference's `COPY … public` step must
be dropped here or the build fails.

Separately, `NEXT_PUBLIC_API_BASE_URL` is inlined into the browser bundle at build
time (`lib/api.ts:1`), so a runtime env var on Coolify does nothing — a published
image would ship with `http://localhost:4200/api` baked in. §4 removes the variable
from the browser path entirely.

---

## 4. Same-origin `/api` proxy (the reference's design, adopted)

`packages/frontend/app/api/[...path]/route.ts` in the reference is a catch-all Node
route handler that forwards every method to `BACKEND_URL`, strips hop-by-hop headers
both ways, re-appends each `set-cookie` individually (`getSetCookie()` + `append`, so
multiple cookies survive), returns **502** when the backend is unreachable and
**503** when `BACKEND_URL` is unset in prod, and maps one path specially:
`/api/health → /health`.

Adopt it near-verbatim, with mokara's two adaptations: the backend already serves
`/health` at the root, and its API base is `/api` (so `/api/teams/…` forwards
unchanged). The browser-side base becomes the constant `"/api"`, and
`packages/frontend/lib/backend-url.ts` (also ported: trims, validates
protocol/query/hash, throws in prod when unset) supplies the server-side target.

Why this is the right shape, not just the familiar one:

- **The cookie works.** `cookies.ts` sets `httpOnly` + `SameSite=Lax` + `Secure` in
  prod. Two unrelated hostnames make the auth cookie cross-site, so it is dropped on
  every `fetch` — login appears to succeed and then `useAsyncError` redirect-loops to
  `/login`. Same-origin removes the failure class.
- **The image is portable.** `BACKEND_URL` is read by the Next server at runtime, so
  one published image serves any host. This is the actual point of pulling instead of
  building.
- **CORS stops mattering.** Keep the middleware (free, and correct for future
  non-browser clients), but `CORS_ALLOWED_ORIGINS` can stay empty.

## 5. Images

### 5.1 `mokara-frontend`

| Stage    | Contents                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`   | `node:24-alpine`, `corepack enable` + `corepack prepare pnpm@11.13.0`                                                                                                                                 |
| `deps`   | copy `pnpm-workspace.yaml package.json pnpm-lock.yaml` + each workspace `package.json`, `pnpm install --frozen-lockfile`                                                                              |
| `build`  | copy frontend source, `pnpm build` (standalone)                                                                                                                                                       |
| `runner` | `node:24-alpine`, `ENV NODE_ENV=production PORT=3000`, copy `.next/standalone` → `/app`, `.next/static` → `packages/frontend/.next/static`; `USER node`; `CMD ["node","packages/frontend/server.js"]` |

No `public/` copy (§3.3). No `sharp` — the app uses no `next/image` (verified).
Healthcheck: `GET /` on `127.0.0.1:3000`, any 2xx/3xx is alive.

The reference pins the tracing root explicitly (`outputFileTracingRoot: projectRoot`).
Mokara only sets `turbopack.root`, which is the bundler root — a different option that
happens to make tracing work here (verified). Setting `outputFileTracingRoot` as well
is what makes the standalone output _intended_ rather than incidental, and it is a
one-line change.

### 5.2 `mokara-backend`

| Stage         | Contents                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`/`deps` | same `node:24-alpine` + corepack pin; full `pnpm install --frozen-lockfile`, all workspace manifests (as the reference does — §7.2)                                                                |
| `generate`    | copy `packages/db/prisma/{schema.prisma,migrations}` + `prisma.config.ts`, `pnpm --filter @mokara/db generate`                                                                                     |
| `runner`      | copy `node_modules`, `packages/db`, `packages/backend/src`, `packages/backend/scripts`; `ENV NODE_ENV=production PORT=4700`; `chmod +x start.sh`; `CMD ["/app/packages/backend/scripts/start.sh"]` |

`scripts/start.sh`, ported from the reference and cut back to two steps:

```sh
set -e
cd /app/packages/db && ./node_modules/.bin/prisma migrate deploy   # idempotent, forward-only
cd /app && exec ./packages/backend/node_modules/.bin/tsx packages/backend/src/index.ts
```

`exec` so SIGTERM reaches Hono (its graceful close is already implemented). The
reference's third step is a `NODE_ENV`-guarded seed; **mokara's seed creates demo
tasks and teams, so it is deliberately left out of the container path** — `pnpm
db:seed` stays a local-only command.

Mokara needs no build-time `DATABASE_URL` placeholder (the reference does):
`prisma.config.ts` reads `process.env.DATABASE_URL ?? ""` rather than Prisma's
`env()` marker, so `generate` is satisfied without one.

### 5.3 Shared rules

One Node pin for both (`node:24-alpine`, matching the root `engines.node: ">=24"` —
the current frontend image pins `24.18.0-alpine3.24` and the backend `node:24-alpine`,
which is how drift happens). `# syntax=docker/dockerfile:1` on both. Root
`.dockerignore` extended with `.pi/`, `docs/`, `**/*.tsbuildinfo`,
`packages/*/dist`, `packages/db/prisma/generated` (generated in-image; copying it in
would mask a stale-client bug).

## 6. The release pipeline

### 6.1 `.github/workflows/release.yml`

Mirror the reference, which is already the shape we want:

- `on: push: tags: ["v*.*.*"]` — strict semver, so `v0.1` or `release-3` cannot fire
  it. Plus a `workflow_dispatch` input for re-publishing a tag.
- `permissions: contents: read, packages: write`; `strategy.matrix.include` with
  `{service, dockerfile, context: .}` per image; `fail-fast: false`.
- Version from `GITHUB_REF_NAME#v`; QEMU + Buildx; `docker/login-action` to GHCR with
  `GITHUB_TOKEN` (no PAT to manage — §8).
- `docker/metadata-action` tags: `type=semver,pattern={{version}}`,
  `pattern={{major}}.{{minor}}`, `type=raw,value=latest`, and
  `type=sha,prefix={{branch}}-` for traceability; OCI labels for title/source/version/
  revision so Coolify and `docker inspect` show what a running container is.
- `docker/build-push-action@v6`: `context: .`, `file: packages/<x>/Dockerfile`,
  `cache-from`/`cache-to: type=gha,mode=max`, `provenance: false`.
- `concurrency: group: release-${github.ref}`, `cancel-in-progress: false`, so two
  pushes of one tag cannot interleave and half-publish.

`metadata-action`'s `latest` is unconditional in the reference, which means an `rc`
tag would move `latest`. Add `enable-version-prefix: false` + a prerelease guard, or
simply never tag prereleases until §9.2 is answered.

### 6.2 Gate the artifact, not just the types

`ci.yml` today runs typecheck/lint/format on `dev`. That is what let §3.1 hide. Add
`pnpm build:frontend && pnpm build:backend` to it (and to release.yml as a first job,
so a tag cannot publish an artifact that does not build). Release.yml's gate job also
runs `pnpm db:migrate:deploy` against a throwaway `postgres` service container — the
check that turns "the tag is the release" into something trustworthy.

### 6.3 Versioning

The git tag is the source of truth; package.json versions may lag without breaking
anything. Release.yml warns (does not fail) when the root `package.json` version
disagrees with the tag.

## 7. Where this PRD deliberately differs from the reference

1. **The backend has no `tsc` build step, and `start` runs `tsx src/index.ts`.** The
   reference emits a `dist/` too, but its CMD runs `tsx src/index.ts`, so the emitted
   output is dead weight there; here emitting is impossible (§3.1), so the build step
   and the dist copy are simply gone. Necessary delta.
2. **`tsx` is a runtime dependency** (§3.2) — same as the reference.
3. **Port parity, not new ports.** The reference keeps dev and prod on the same ports
   (3400/3401); we keep dev = prod too — **4701/4700** as of 2026-09-03 (originally
   4201/4200, renumbered because 4200 was already allocated on the deployment server;
   both `.env.example` and the Dockerfiles moved together so one env story covers both).
4. **Image hygiene the reference skips:** `USER node`, `HEALTHCHECK` in both images,
   `HOSTNAME=0.0.0.0` on the frontend (a container runtime sets `HOSTNAME` to the
   container id, and the standalone server binds to that), and per-service GHA cache
   scopes so the two matrix jobs cannot overwrite each other's cache entries.
5. **`start.sh` has no seed step** — mokara's seed creates demo users and tasks, so it
   stays a local-only command.
6. **A `gate` job runs before any image is published** (§6.2). The reference has none.
7. **esbuild bundling deferred** — proven to work here (§3.1) and it would cut the
   backend image substantially, but it is an optimisation, not a prerequisite.
8. **Kept from the reference without change:** the release trigger, matrix, QEMU, GHCR
   login with `GITHUB_TOKEN`, the metadata tag set, `type=gha` caching and
   `provenance: false`; the proxy route (which also maps `/api/health → /health`); and
   the runner carrying a dev-included `node_modules`, which is what lets `prisma` stay
   a devDependency of `@mokara/db`.

## 8. Coolify wiring

1. Coolify → Server → **Private Registries**: `ghcr.io`, namespace `<owner>`, username
   = GitHub login, password = fine-grained PAT with **read:packages**. (Owner deferred
   public/private; this line is only needed if the packages stay private.)
2. One Coolify application, four services: Postgres 16 (private network, volume,
   backups on), Redis 7 (provisioned because `ioredis` is already a dependency, though
   it has no consumer until PRD-03 phase 2), backend image, frontend image.
3. Backend gets **no public domain** — only the frontend proxy reaches it, over the
   internal Docker network. Frontend gets the public domain and port 3000.
4. `BACKEND_URL` on the frontend = the backend's internal URL
   (`http://<backend-service>:4700`). If it is unset in prod the proxy answers 503
   rather than silently misrouting.
5. Deploy = Coolify pulls the new tag. Rollback = reselect the previous tag.
   **The DB does not roll back with the image**, so rollback is only safe for
   code-only releases — which is why every migration must stay backward-compatible
   for one release (add a column, use it, drop it in the _next_ release).

## 9. Decisions requested

1. **Ports.** The reference keeps dev and prod on the same port (3400/3401). Mokara's
   dev ports are 4200/4201 while its Dockerfiles say 3000. Recommend: containers use
   the dev ports (backend 4200, frontend **4201**) so one env story covers both, and
   `.env.example` gains the prod `BACKEND_URL` form. Confirm, or pick 3000/4200.
2. **Prerelease tags.** Allow `-rc.1` at all (needs the `latest` guard in §6.1), or
   keep `v*.*.*` strict and never tag prereleases?
3. **`AUTH_SECRET` currently defaults to `""`** in `env.ts` — an HS256 JWT signed with
   an empty key boots happily. Make the backend refuse to start in production without
   it? (Recommended: yes, one guard next to `isProd`.)
4. **`@mokara/frontend` proxy: port the reference's `route.ts` + `backend-url.ts`
   near-verbatim**, or write a leaner one? Recommend port — it already handles the
   multi-`set-cookie` and 502/503 cases that are easy to get wrong.
5. **Does §3 get fixed inside PRD-07, or as a preceding "make prod builds work" PR?**
   §3.1–3.3 are prerequisites; §5–6 are the actual release work.

## 10. Build order once approved

1. §3.2 — move `tsx` + `prisma` to `dependencies`. One-line package.json changes.
2. §3.1 — backend runs on `tsx` in prod; drop the broken `build` script (or point it
   at a no-op) so `pnpm build:backend` stops lying. Keep `tsc --noEmit` as the gate.
3. §3.3 + §4 — `output: "standalone"`, `app/api/[...path]/route.ts`,
   `lib/backend-url.ts`, browser base → `"/api"`. Verify locally: standalone server +
   backend, login → cookie set → `/api/teams` 200 **through the proxy**, and
   `/api/health` proxied.
4. §5 — rewrite both Dockerfiles, extend `.dockerignore`, unify the Node pin.
   `docker build` both locally and `docker run` them before any CI time is spent.
5. §6.2 — CI gains the two build steps + the migrate dry-run.
6. §6.1 — `release.yml`; dry-run against a throwaway `v0.0.0-test` tag; confirm images
   and tags in GHCR; delete the test release.
7. §8 — Coolify registries, services, env, deploy the pinned tag.
8. Tag `v0.1.0` for real. §8.5 becomes the release process.
