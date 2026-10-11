# Admin monitoring — initial operational overview

## Scope

The operator console lands on **Overview**, with **Needs attention**, **Users**, **Workspaces**, **Billing**, and **Audit** navigation. The admin service remains a session-gated proxy: no DB, Redis, storage or Stripe credentials are added to it. No new dependencies, suspension controls, retries, remote configuration changes or automatic external probes are introduced.

### Overview

- Backend package version, deploy mode, process uptime and snapshot timestamp. Package version is not an image commit SHA, and uptime is for the responding replica.
- Database `SELECT 1` and Redis `PING` checks, with two-second response deadlines. A deadline stops waiting; it does not cancel an already-started driver operation.
- Storage, Stripe/checkout and GitHub/webhook **configuration status**, explicitly not live third-party health or delivery verification. No S3/Stripe/GitHub API is contacted for the overview.
- Total users, rolling seven-day signup count, workspaces, tasks, files and attachment/logo bytes recorded in Postgres. Storage metadata excludes orphaned bucket objects and is not a bucket inventory or quota-limit report.
- All effective-plan buckets and task-status buckets, including zeroes. Effective plans include operator grants and must not be treated as paid subscriptions, MRR or revenue.
- GitHub pending/retrying/older-than-five-minutes jobs, failed or paused links, expired user verification, oldest pending timestamp and latest recorded linked-issue sync.
- Cached billing grace flags, including expired flags; not a real-time Stripe payment-failure count.

Database snapshot failures and unavailable counters are shown as **unknown/unavailable**, never converted to reassuring zeroes. Dependency health and dataset availability are distinct: a successful DB ping does not guarantee every aggregate query succeeded.

### Needs attention

The overview shows eight categories, including zero counts. Categories may overlap and are not summed into a misleading distinct total. The queue inspector paginates GitHub jobs with a last error or more than five minutes pending, oldest first, 25 per page. It shows only job/delivery IDs, type, attempts, timestamps, lease expiry and safe error codes—not payloads, task descriptions, branches or credentials.

The Users list additionally identifies billing grace flags, revoked/expired GitHub connections and published issue links needing attention. User detail shows GitHub connection/verification state, active repository count and affected-link count. Existing billing context and plan controls remain intact; no private task content or repository names are added.

These views are read-only. A `202` GitHub delivery still means queued, not necessarily successfully synchronized.

### API counters

The backend request logger records aggregate Redis counters for API requests, HTTP 5xx, API error codes and Stripe webhook accepted/failed responses. Admin traffic and `/health` are excluded.

- Minute buckets shared across backend replicas.
- Display window: the current partial minute plus the previous 59 minute buckets.
- Retention: two hours per bucket. Counts begin when this implementation is deployed; there is no historical backfill.
- No request paths, URLs/query strings, IPs, user identities, tokens, response messages or bodies are persisted in these counters.
- Telemetry is best-effort: write failure never fails the product request and can lose samples. Current Redis read failures appear as unavailable metrics; warnings are rate-limited. Zero means no errors **recorded**, not proof of no failures during an earlier telemetry outage.
- Counts are operational signals, not unique-user activity or payment/subscription analytics. Accepted billing deliveries may include ignored event types.

### Audit trail

`AdminAuditEvent` durably records real changes to the existing operator plan override: timestamp, configured operator account, action, target user ID/username snapshot, previous override and next override.

- A row lock serializes concurrent plan edits; the user update and audit insertion commit in the **same transaction**. If audit persistence fails, the grant rolls back.
- No-op changes do not create audit records.
- `free` revokes an override by storing `NULL`. It never writes Stripe's plan or cancels a subscription.
- Actor identity is taken from the authenticated server-side operator account, never client input. This console has one configured identity: shared credentials cannot distinguish individual humans.
- No credentials, bearer tokens, session IDs or request bodies are stored.
- Deleting a target user retains the username snapshot and sets the FK to null. Audit pages remain read-only, newest first, 25 per page, with an explicit deleted-user label.
- Only post-deployment changes are audited; earlier console logs are not reconstructed into invented history. No automatic purge is introduced; retention policy is an operator decision.

## Workspace support

Workspaces are searchable by name, slug or owner and paginated 25 per page. Detail shows the owner, member usernames/roles, effective plan and its two inputs, task-status totals, attachment/logo storage, member/storage/file limits, owner team-slot usage and GitHub publication/sync counts. User profile workspace names link to detail.

Caps come from `lib/plans.ts`, including operator grants and self-hosted unlimited enforcement. Tasks have no plan quota; no invented task limit is shown. Storage includes recorded attachment/logo bytes, not orphaned bucket objects. The owner's personal GitHub connection is labeled separately from workspace issue links, which can belong to other publishers. Private task descriptions, comments, file names/URLs, repository names and credentials are not queried or exposed.

## Billing support

The paginated Billing view searches users and filters provider status, unknown observations, scheduled cancellations, last failed-invoice notifications, reconciliation errors or operator grants. Four summary cards show all matching accounts, last-observed active subscriptions, operator grants and accounts with a last reconciliation error. Counts apply to the complete filtered dataset, not just the visible page; the read-only queries share a repeatable-read snapshot. These are not revenue or live Stripe metrics, and unassigned failures remain in history.

The primary table has five columns: Account, Plan, Subscription, Last verified and Details. Expand a row for the cached Stripe plan, grant, customer connection, cancellation, period/grace dates, invoice notification and sync attempt/error. These inputs remain distinct; missing dates use an em dash, while unknown verification is explicit. Search/filter/refresh share one toolbar. Its **View updated** timestamp is the page snapshot time, never the provider-verification time. Full definitions and billing configuration remain under Info. Subscription/grant/sync-error cards show matching-account ratios, e.g. `0 / 7`. During mixed-version rollout, a complete legacy account list supplies real counts locally; a later page can retrieve the first page when the entire cohort fits on one page. Partial cohorts cannot supply global totals: show an em dash and a backend-update notice, never invented zeroes. Redeploy backend and admin together for authoritative full-dataset aggregates.

Existing provider webhook/user-sync flows now persist retrieved subscription status, scheduled cancellation, successful verification timestamp and attempt/error metadata. User sync reads every subscription page before selecting a live or latest terminal subscription. A verified empty customer subscription list reports `none` without revoking a comp; accounts not yet observed remain `unknown`. Opening admin never fetches Stripe or changes billing.

Invoice `paid`/`payment_failed` notifications are recorded after subscription reconciliation, using provider event time to reject delayed notifications. They are explicitly the last notification, not complete invoice history or a guarantee of current payment state. Active/trialing does not prove payment. Unmapped prices are configuration warnings, not legitimate paid tier grants.

`BillingReconciliationEvent` records post-deployment webhook/user-sync attempts and classified errors only; no provider response messages, payloads, tokens or payment details. Failure preserves the last successful verification. Retrieval failures before user resolution appear as unassigned history; deleting a user sets the history FK to null. History has independent pagination and follows the user search, not the status filter. A failed history write preserves the existing webhook failure/retry behavior rather than pretending an operation was observed successfully.

## Audit search

Audit can filter by operator, username snapshot or exact user UUID, action, and inclusive UTC date range. Date bounds are labeled UTC; the end is the start of the following UTC day. Deleted-user snapshots remain searchable. Invalid/reversed ranges and unknown actions return 400. Pagination retains filters; applying or clearing filters resets pagination. No new support mutations are introduced, so existing grant changes remain the only operator action to audit.

## Routes and rollout

Backend routes are protected by the existing admin Bearer-token gate and use `Cache-Control: no-store`:

```text
GET /api/admin/overview
GET /api/admin/attention?page=1
GET /api/admin/audit?page=1&actor=&user=&action=&from=2026-10-01&to=2026-10-10
GET /api/admin/workspaces?page=1&q=
GET /api/admin/workspaces/:id
GET /api/admin/billing?page=1&q=&status=
GET /api/admin/billing/history?page=1&q=
```

The console exposes session-protected corresponding proxy routes and Overview, Attention, Workspaces, Billing and Audit pages. Existing `/users` pages and grant endpoints remain supported. Read failures do not bypass either auth gate.

Migrations: `20261010160000_admin_monitoring` and `20261010180000_admin_support`. Apply it through the normal backend bootstrap before operating plan controls; missing audit storage must fail closed rather than produce untracked grants. Redeploy **both backend and admin** for this feature. No new environment variables are required.

The UI uses the existing CSS/JS assets, CSP and `createElement`/`textContent` rendering. A light white/gray theme with blue accents groups Operations, Accounts & support, and Governance in the sidebar, with active navigation and a keyboard skip link. All eight authenticated views use title-only headers, shared summary-card styling, compact refresh/snapshot controls and grouped panels. Overview shows service cards instead of a health table. Attention, Users, Workspaces and Audit use five-column tables with keyboard-expandable details; complete job/delivery IDs, flags, quota facts and audit actions remain accessible. User and workspace details group account/capacity/billing/integration facts. Login and signed-out screens share the console branding. Overview plan/task breakdowns sit side by side on desktop; narrow screens stack panels and retain every zero-filled dataset. Tables have bounded horizontal scrolling; no inline scripts/styles or third-party browser requests are added. Snapshots are refreshed manually, not with a polling loop. Copy is intentionally compact: refresh controls and pagination omit repetitive guidance, while expandable native notes retain data definitions and caveats. Unavailable-data warnings and grant-revocation consequences stay visible. The Billing redesign adds read-only aggregate response fields; authentication, provider synchronization and support mutations are unchanged. Shared toolbar/expandable-row patterns follow [Carbon data-table guidance](https://carbondesignsystem.com/components/data-table/usage/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

## Verification

```sh
pnpm db:generate
pnpm typecheck
pnpm --filter @mokara/backend test:admin
pnpm --filter @mokara/backend test:github
pnpm lint
pnpm format
```

The admin tests use in-memory DB/Redis doubles and a native-DOM script harness. They check auth, degraded/unknown states, counter retention and redaction, queue pagination, effective-plan zero filling, user flags, audit attribution/no-op/rollback and text-safe UI rendering. They do not replace real-Postgres concurrency or owner acceptance. Production builds remain CI-owned.

Owner acceptance after deployment:

1. Verify the overview version and timestamp, DB/Redis checks and clearly labeled configuration-only services.
2. Inspect known GitHub retries/pauses and account flags; confirm empty counts are zero and failed reads are unavailable.
3. Perform a known test API failure/billing delivery and verify the aggregate counter changes without content disclosure.
4. Grant, repeat the same grant, then revoke it: exactly two new audit records, correct configured actor and unchanged Stripe plan.
5. Exercise all eight authenticated views plus login/sign-out at desktop/mobile widths. Check summary counts, refresh/snapshot controls, keyboard row expansion, pagination and expired sessions. Cards labeled “page” count only the current page; other directory totals cover all matching records. No unknown read may become a fake zero.
6. Search a workspace, inspect member/storage usage and owner team slots against its effective plan; check a self-hosted instance displays unlimited caps and no private task content.
7. Inspect an existing subscription/grant separately. Check Billing summary totals and count/total ratios across pagination and filtered accounts; open/close row Details with the keyboard. Refresh must change View updated without inventing a new Last verified timestamp. Trigger existing billing sync or a test webhook; check verified/attempt dates, cancellation/payment notifications and classified failure history. Pre-feature accounts must remain unverified until observed; disconnected customer accounts are labeled separately.
8. Filter Audit by operator, username/UUID, action and UTC date range; paginate without losing filters and search a deleted-user snapshot.

## Deferred

Historical API incident storage/alerts, live storage inventories, complete invoice/payment history, last-login/retention analytics, suspension and retry controls remain separate follow-ups. They are not implied by zero counters or by the current configuration indicators.
