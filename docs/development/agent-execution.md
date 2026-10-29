# Agent execution implementation and QA

This feature is local on `agent-task-sync`. No commit, push, merge, release or
publication is part of this implementation request.

The [public integration guide](../../packages/frontend/public/docs/agent-execution.md)
is the vendor-neutral client contract. `/docs/mcp` links it and lists all 66 tools,
including 19 new agent-execution tools. The downloadable Mokara skill also explains
explicit execution authorization.

## Ownership and transactions

- `lib/agent-sync-contract.ts` owns strict boundary schemas and capability metadata.
  `mcp/agent-tools.ts` adapts those schemas to existing MCP registration. Browser
  session routes expose reads and management, never external execution authority.
- `lib/agent-sync.ts` is the service boundary for permissions, signed cursors,
  consistent reads and typed errors. Ordinary task routes remain the only ordinary
  task-edit interface. No external runner or particular client is implemented.
- Migration `20261029090000_agent_sync` adds false readiness/pause defaults,
  monotonic task/content revisions and execution/event/request tables. It is wrapped
  in a PostgreSQL transaction. Scope constraints accept new permissions without
  updating grants or tokens.
- PostgreSQL `agent_sync_command` locks current membership/grant, serializes the
  actor/request UUID, checks/replays its canonical payload hash, applies the state
  transition and records the outcome in the same transaction. Both successful
  results and domain failures are replayable. Unexpected transaction failures roll
  back; recognized deadlock/serialization failures request a same-ID retry.
- Claim holds the task row lock, consumes readiness and saves a fixed accepted
  snapshot. A partial unique index permits one blocking run per task, including an
  unknown outcome. Ownership is authenticated connection + installation + run ID,
  not possession of a readable run ID alone. No lease bearer secrets are returned.
- Task and child-table triggers record revisions/events for ordinary writes too.
  Per-workspace event clocks retain their row lock through commit, avoiding the
  commit-order holes of bare global sequences. Read operations use repeatable-read
  transactions; membership and grant locks protect authorization through commit.
- A 30-second lease sweep materializes expired work as Unknown with a durable event.
  Reads detect expiry immediately; no second executor is started. Multiple backend
  workers remain safe under database locking. Deleting a task requests cancellation
  and retains internal execution history, while reads of deleted contents are denied.
- New UI uses official Jotai `atomWithRefresh`/`loadable`, existing button tokens and
  the central error path. There are no new effects or animation timers. Uncertain
  saves retain the request UUID, block new management actions and offer same-request
  retry. Task edits invalidate the saved detail view; reloads read persisted data.

No new production environment settings or storage bucket are required. Existing
`AUTH_SECRET` (at least 32 characters) signs cursor tokens. Its rotation invalidates
cursors and requires rebuilding synchronization from the retained event feed.
`AUTH_PUBLIC_URL` continues to own the discovered endpoint. Never add a second
public-URL setting or fixed deployment hostname.

## Verification commands

Run from the indicated package. The pnpm wrapper could not verify/download the
pinned pnpm version in this restricted environment, so equivalent installed local
executables were used; dependency verification was not bypassed.

| Check                       | Actual command / outcome                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generate                    | DB: `node_modules/.bin/prisma generate` — passed.                                                                                                                                                                                                                      |
| Type checks                 | Each of frontend, backend, admin, DB and Redis: `node_modules/.bin/tsc --noEmit` — passed. Frontend also checked without incremental cache and with `next-env.d.ts` temporarily removed/restored.                                                                      |
| Lint                        | Frontend: `node_modules/.bin/eslint .` — passed, five pre-existing image warnings.                                                                                                                                                                                     |
| Architecture                | Root: `node packages/frontend/scripts/check-architecture.mjs` — passed.                                                                                                                                                                                                |
| Environment contract        | Root: `node scripts/check-env-examples.mjs` — passed; no application env additions.                                                                                                                                                                                    |
| Formatting                  | Root check found only two pre-existing untracked architect-skill files with formatting differences; the implementation-file check passed. Those unrelated files are untouched.                                                                                         |
| Backend regressions         | Backend: `node --import tsx --experimental-test-module-mocks --test test/*.test.mjs` — 417 passed; dedicated PostgreSQL file intentionally skips when its test URL is absent.                                                                                          |
| Frontend regressions        | Backend: `TSX_TSCONFIG_PATH=../frontend/tsconfig.json node --import tsx --test ../frontend/test/*.test.mjs` — 127 passed.                                                                                                                                              |
| Actual database integration | Backend: set `AGENT_SYNC_TEST_DATABASE_URL` to a dedicated database whose name contains `agent_qa`; run `node --import tsx --experimental-test-module-mocks --test test/agent-sync.postgres.test.mjs` — 20 passed.                                                     |
| Empty database migrations   | DB: `DATABASE_URL=<dedicated-test-database> node_modules/.bin/prisma migrate deploy` — all 45 migrations applied.                                                                                                                                                      |
| Existing-data upgrade       | Isolated PostgreSQL database with the first 44 migrations, an existing In progress task and read-only grant; apply the final migration — task/status preserved, readiness false, revision one, grant unchanged and initial event present.                              |
| Production build            | Frontend: `BACKEND_URL= node_modules/.bin/next build` — passed using local compiler permissions. The restricted build stalled in compile with no worker progress; it was stopped and the same build completed outside that restriction. No live backend was contacted. |

The database suite uses two real Prisma/PostgreSQL connections and the actual SQL
state machine. It covers concurrent claims, simultaneous identical retries,
conflicting payloads, revision conflicts, immutable accepted snapshots, large
current-instruction chunks, comment attachment metadata, ownership, renewal,
expiry/stale owners, completion/failure/release, explicit recovery, cancellation,
archive/deletion, equal-time event ordering, pagination/restart, transactional
rollback, membership locking/revocation and calls through actual MCP transport.
Only Redis limiting is substituted for the in-process MCP test; database behavior
is not mocked. CI now runs this suite after applying migrations to its own database.

## Investigated failures and verification limits

Initial QA exposed a cascade-delete event attempting to reference an already
deleted workspace; event emission now skips a workspace removed by the same
transaction. The clean-schema tests verify cleanup succeeds. Review also removed
a membership-check/lock gap by checking the result of the locking authorization
query directly. A real-database test proves membership removal cannot commit while
that authorization lock is held and subsequent reads are denied after removal.

The frontend malformed-success test caught an all-optional management-result
schema. It is now a required readiness-result or execution-result union. Tests
reject malformed bodies. Test fixture issues were also corrected: existing
credential-kind checks require a token hash, required legacy timestamps must be
seeded, and changed payloads cannot reuse a request UUID. Constraint assertions
use the existing Prisma driver-adapter error helper.

Automated UI checks cover loading, the separate action/state presentations,
escaped results, uncertainty disabling controls, transport failure/retry identity
and re-reading saved state on reopen. Full browser interaction verification is
**not claimed**: the browser's URL policy rejected the local HTML preview protocol.
No alternate surface or server workaround was used. No live Mokara requests,
external client execution or external side effects were tested.

The disposable PostgreSQL container and its databases are removed after verification.
The owner’s existing application database, Redis, services and environment files
are not modified. No remote CI run or deployment is implied by these local results.
