# Environment configuration

Mokara uses per-package configuration, not a root `.env`. Copy each package's `.env.example` to `.env` for local development. For containers, provide those settings through the deployment platform's runtime environment/secrets. Never pass credentials as Docker build arguments or put them in frontend public variables. The published images contain no deployment credentials.

Run `pnpm env:check` to check template coverage, blank secret fields and tracked sensitive file paths. The root lint command runs this check too. This checks current source/templates and tracked paths, not Git history or the validity of real credentials.

| Package          | Template                         | Configuration                                                                                                        |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Backend          | `packages/backend/.env.example`  | Database, Redis, token signing, deployment mode, storage, OAuth, Turnstile, MCP origins, billing and operator access |
| Frontend         | `packages/frontend/.env.example` | Internal backend address, public origin/SEO, trusted IP forwarding and legal identity                                |
| Admin            | `packages/admin/.env.example`    | Explicit internal backend address, admin port, environment mode and the two shared admin secrets                     |
| Database tooling | `packages/db/.env.example`       | Same database as the backend for migrations/generation/seed operations                                               |

## Deployment requirements

- Set backend/admin `ENV=production`. Published images set `NODE_ENV=production`; do not override it to development. Cookie security depends on keeping these modes aligned.
- Generate `AUTH_SECRET` with `openssl rand -base64 48`. Do not use a sample value. Production rejects missing/short keys and the repository's former public example/development signing keys. If a public example key was ever deployed, replace it; existing JWT sessions will need to sign in again.
- Set explicit `DATABASE_URL` and `REDIS_URL` to services belonging to this deployment. Local example passwords are only for the loopback-bound development Compose services. Use private networking, appropriate authentication and provider-recommended TLS for remote infrastructure; never expose the development Redis/Postgres/MinIO ports publicly.
- Set frontend and admin `BACKEND_URL` to the internal backend origin. It is server-only. Admin now refuses to start without an explicit valid URL. There is no public API-base variable to configure.
- Set backend `AUTH_PUBLIC_URL` to this deployment's browser-facing frontend origin for browser write protection, social login and MCP OAuth. Set frontend `NEXT_PUBLIC_SITE_URL` to the same public origin for SEO/legal links. They serve separate applications; configure both consistently. Neither is a secret. Callback URLs must match the providers' registered values. No separate MCP issuer variable or bucket is required.
- Keep `SEO_INDEXABLE=false` on development/staging or private instances. Enable it only for the public site you intend search engines to index. Robots rules are not access control.
- Hosted deployments use `DEPLOY_MODE=hosted`; self-hosted defaults to unlimited capacity with billing off. Hosted production registration requires a complete Turnstile configuration. Social authentication credentials are separate from the GitHub App repository integration.
- For distinct client-IP quotas behind the frontend proxy, share a fresh `AUTH_PROXY_SECRET` between backend and frontend and configure frontend `AUTH_CLIENT_IP_HEADER` only behind an ingress that overwrites that header and blocks direct origin access. If forwarding is intentionally off, leave both frontend settings blank; quotas conservatively share the proxy peer. See [auth protection](auth-protection.md).
- Storage uses one private S3-compatible bucket for attachments, logos and mDrive. All required S3 fields must be supplied together; leave them blank to disable uploads. Do not make the bucket public to fix upload errors.
- Admin is optional. Leave all backend `ADMIN_*` values empty to disable it. When enabled, generate independent secrets and copy only `ADMIN_TOKEN_SECRET` and `ADMIN_URL_KEY` to the admin service. The admin service does not need database, Stripe or operator-password credentials.
- Stripe/provider credentials are optional integrations, not requirements for a local self-hosted instance. Populate only the blocks you enable; never reuse development and production credentials.

Ports are configured by backend `PORT`, admin `ADMIN_PORT`, and the frontend runtime's `PORT`/`HOSTNAME`. The Dockerfiles supply normal container defaults. These infrastructure controls are separate from application-secret templates.

## Handling local files

`.gitignore` excludes real `.env` variants and private-key files. `.dockerignore` excludes environment files and PEM/key/P12 containers from image build contexts; `.env.example` templates are allowed and must contain blank secret fields. Never commit actual provider keys, account-specific bucket coordinates or customer data into templates. Existing local `.env` files are operator-managed and are not rewritten by the coverage check.

## Demo seed safety

Both demo seed tools require explicit `ENV=development`, `DEMO_SEED_ENABLED=true`, and a non-production `NODE_ENV`. Database seeding additionally requires a loopback PostgreSQL URL; it preserves existing users’ passwords on repeat runs. The screenshot seed requires an explicit loopback HTTP(S) backend origin, refuses redirects and does not print session tokens. There is no remote-target override.

For database demo data, configure the database package's `.env` with a local development database and run `DEMO_SEED_ENABLED=true pnpm db:seed`. For screenshot fixtures, explicitly set both environment flags and pass the local backend origin to `node scripts/seed-demo.mjs`. The owner starts services and runs these tools; agents must not run them against live services. Do not point a loopback tunnel at production: a local address is a guard against accidents, not proof that the database is disposable. Production startup never seeds demo data.
