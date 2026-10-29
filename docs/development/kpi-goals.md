# Business KPIs

Business KPIs are available on Analytics and the Team page. They record actual
business measurements alongside the existing weighted-task KPIs. This work does
not convert existing KPIs or change their calculation, task links, ownership,
visibility, deletion rules or existing MCP responses.

## Using business KPIs

1. Open Business KPIs and choose New KPI.
2. Create a personal goal, or, as the workspace owner, choose Team for a workspace
   that already has a teammate. Personal goals are visible only to their owner.
3. Choose Number, Percentage or Money, with a starting value, target and period.
   A lower target supports reductions such as response time. Money uses a
   three-letter currency code. Percentage values stay between 0 and 100.
4. For shared goals, choose the accountable owner and named contributors from
   current workspace members. Other current members can read shared goals.
5. Check in with an absolute measured result and its observation date, optionally
   explaining the result. MYR 5,000 means the measured total is MYR 5,000, not that
   another MYR 5,000 should be added.
6. Open History to review the original goal, check-ins, names, notes and changes
   to ownership, contributors or archived state. Archive a goal to stop new
   check-ins while retaining its results.

A sales goal starting at MYR 0 with a MYR 20,000 target reaches 25% at MYR 5,000.
A response-time goal starting at 24 hours with a 12-hour target reaches 50% at
18 hours. Completing tasks does not record sales or change these values.

Each goal has its own dates; the activity chart's date range does not alter them.
Measurement, visibility, baseline, target and dates are fixed after creation.
Create a separate goal for a new period or target. This preserves the meaning of
old check-ins without silently resetting results.

## Access

| Action                               | Personal goal                      | Shared team goal                                       |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| Create                               | Any current member, for themselves | Workspace owner                                        |
| Read/history                         | Goal owner                         | Current workspace members                              |
| Check in                             | Goal owner                         | Accountable owner, named contributors, workspace owner |
| Rename/transfer contributors/archive | Goal owner; stays personal         | Accountable owner or workspace owner                   |

New writes are refused after membership is removed. Contributor membership is
also enforced by database references. Removing a contributor removes future
write access without erasing earlier entries. Removed users' names remain in
historical snapshots; owner/author references become null on account deletion.
An unassigned shared goal can be reassigned by the workspace owner.

## Public application API

All routes use the existing authenticated same-origin API and require current
workspace membership. Responses are private and not cached. OAuth scopes remain
unchanged. The legacy MCP KPI tools stay task-based; phase four adds separate
business KPI tools for these measured goals.

| Method | Path                                                             | Purpose                                                     |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/teams/:workspace/kpi-goals?cursor=:goal_id`                | List accessible goals, members and team-creation permission |
| POST   | `/api/teams/:workspace/kpi-goals`                                | Create a business goal                                      |
| PATCH  | `/api/teams/:workspace/kpi-goals/:goal`                          | Update name, owner, contributors or archived state          |
| POST   | `/api/teams/:workspace/kpi-goals/:goal/check-ins`                | Record a dated result                                       |
| GET    | `/api/teams/:workspace/kpi-goals/:goal/history?cursor=:sequence` | Read immutable history                                      |

List and history pages contain up to 20 records and return `next_cursor`. Goal
pages use stable creation-date/id ordering. History uses an increasing database
sequence, independent of equal timestamps. Both recheck access on every request.

Create accepts `request_id`, `name`, `scope`, `measurement`, `unit`, `baseline`,
`target`, `start_date`, `end_date`, `owner_id` and `contributor_ids`. Decimal values
are strings with at most 12 integer and four fractional digits; reporting dates
are ISO calendar dates. Unit can be null for a plain number.

Check-in accepts `request_id`, `expected_revision`, `value`, `observed_on` and
`note`. Details updates accept `request_id`, `expected_revision`, `name`,
`owner_id`, `contributor_ids` and `archived`. Targets cannot be rewritten by that
operation. Every successful mutation returns `{ goal, entry }`.

## Results and concurrent updates

- Progress is `(current - baseline) / (target - baseline)`, clamped to 0–100 and
  truncated to two decimal places. A result just below the target cannot round
  into Target reached. Decimal arithmetic preserves submitted values.
- No check-in means `current_value` and `progress` are null, rather than an
  invented result. Cards distinguish No check-ins, Starts soon, Period ended,
  In progress, Target reached and Archived. These describe facts, not forecasts.
- Observation dates must be within the goal period and no later than the current
  UTC date according to the database. A late submission for an earlier period is
  allowed. A backdated observation stays in history and does not replace a newer
  observation. For equal dates, the later accepted check-in takes precedence.
- Membership locks are held through writes. A goal-row lock serializes check-ins
  and details changes. Stale revisions return `kpi_goal_revision_conflict`.
- Creation serializes matching request UUIDs. Each history entry has a unique
  goal/request UUID pair and a payload hash. Identical retries return the original
  snapshot and entry. Changed payloads return `kpi_goal_idempotency_conflict`.
  The frontend retains a request UUID for each form lifetime and never silently
  retries a changed request with a new identity.
- Values, revisions and history entries commit together. Errors roll them back.
  A transaction retry response instructs the caller to reuse the same request.

Expected errors use the normal `{ error, message }` contract and frontend unified
error handler. Access failures use forbidden/not-found; invalid definitions use
`kpi_goal_invalid_input`; transaction rollback uses `kpi_goal_retry`.

## Deployment and verification

Apply additive migration `20261029100000_kpi_goals` through the normal migration
process and deploy matching frontend/backend images. There are no new application
environment variables, providers, background jobs or changes to plan allowances.
Legacy KPI tables are untouched.

Focused tests: from backend run `node --import tsx --test test/kpi-goals.test.mjs`.
Real PostgreSQL coverage: set `KPI_GOALS_TEST_DATABASE_URL` to an isolated database
whose name ends in `kpi_qa` or `agent_qa`, apply migrations, then run
`node --import tsx --test test/kpi-goals.postgres.test.mjs`. Never use an application
or customer database. CI runs this after its empty-database migration check.
Frontend tests: from backend run `TSX_TSCONFIG_PATH=../frontend/tsconfig.json node
--import tsx --test ../frontend/test/kpi-goals.test.mjs`. Use Node 24, matching CI.

## Phase two: reviewing results

Choose Review trend on any accessible business KPI. This read-only view adds:

- A plot of recorded progress by observation date, with exact measured values,
  author, note and recording time in an accessible table.
- A comparison of the latest two observation dates shown, in percentage points
  toward the goal. This is not the percentage change in the measured value.
- Deadline context and an explained straight-line pace guide. The guide compares
  the most recent recorded progress with elapsed calendar time between the start
  and end dates. It assumes even progress and never forecasts completion.
  Old observations can make the comparison incomplete. Missing results remain
  unreported; they do not become zero or an inferred failure.

Reporting uses server UTC dates. The start is 0% elapsed and the end is 100%; a
single-day period has a 100% guide on its reporting day. After the period ends,
the view reports the recorded outcome and allows existing late-check-in behavior.
Archived goals keep their review. Target reached is described as Target recorded
rather than proof of when the business event happened.

`GET /api/teams/:workspace/kpi-goals/:goal/review?cursor=:cursor` returns `goal`,
`as_of`, `observations` and `next_cursor`. Each observation has `id`, `observed_on`,
`value`, `progress`, `author_name`, `note` and `recorded_at`. Values remain decimal
strings. At most 30 observation dates are returned per page, newest first.
The last accepted check-in for a date supplies its plotted value; earlier
corrections remain in History. Sequence, not recording timestamp, breaks ties.
Lines connect recorded dates and do not estimate missing observations. Plotted
progress is capped at 0–100%; exact table values are not capped.

A repeatable-read transaction keeps the definition, revision and observations
consistent. Cursors identify the goal, revision and exclusive date boundary.
They are opaque pagination tokens, not authorization credentials. Access is
rechecked before reading or using them. Malformed or cross-goal cursors return
`kpi_goal_invalid_input`; changed revisions return `kpi_goal_revision_conflict`.
Refresh review to restart at the newest observations after a conflict.

This phase adds no database migration, provider, background job, environment
variable or MCP tool. Existing endpoints and persisted check-in records remain
compatible.

## Phase three: linked reporting periods

Choose More → Reporting periods on a KPI card to open a side-by-side comparison of the selected goal and its
linked previous and next periods. Navigate those links to review older periods.
Each column shows its dates, accountable owner, starting value, actual recorded
result, target, attainment and latest observation. Different targets and missing
results remain explicit. A comparison in percentage points describes attainment,
not a ranking of business performance. Shorter or unfinished periods may not be
comparable to completed periods.

The personal goal owner, or workspace owner for shared goals, can choose Create
next period. Monthly and quarterly presets suggest a one-month or three-month
period starting the day after the previous one ends. Boundaries clamp to the last
available day of the destination month, then subtract one day for an inclusive
end date. Standard calendar-month periods therefore keep calendar boundaries.
The dates remain editable and must be confirmed with the name, owner, contributors,
starting value and target. Visibility, measurement and unit stay the same. The
new start must be after the previous end, so periods cannot overlap.

A new goal is created with empty results, its own revision and history, and a
link to the previous goal. The old target, results, archive setting and history
are untouched. Late check-ins retain their existing behavior. New periods do
not copy measured results or automatically archive previous periods. This is
user-confirmed repetition; no scheduling preference or background recurrence job
is added. Existing goals receive no automatic links.

- `GET /api/teams/:workspace/kpi-goals/:goal/periods` returns `goal`, `previous` and
  `next`. Missing neighbors are null. Current membership and visibility are
  checked for each period within a consistent read transaction.
- `POST /api/teams/:workspace/kpi-goals/:goal/periods` accepts the normal create
  fields plus `expected_revision` for the source goal. Visibility, measurement
  and unit must match the source. It returns the normal `{ goal, entry }` result.
  UUID idempotency, payload conflicts and source revision checks apply. Source
  locking plus a unique database reference allows exactly one next period.
  Duplicate next periods return `kpi_goal_period_exists`; cancel the form and
  refresh Reporting periods to open the existing one.

Goal DTOs add `previous_goal_id`, `next_goal_id` and `can_create_period`. Old
history snapshots remain readable with defaults for those additive fields.
Apply additive migration `20261029120000_kpi_periods` before matching application
code. The database constrains links to the same workspace and rejects self-links.
There are no new environment variables or MCP operations.

## Phase four: business KPI access through MCP

Six additive MCP tools expose the measured business goals from these phases.
`list_business_kpis`, `get_business_kpi`, `get_business_kpi_review`,
`list_business_kpi_history` and `compare_business_kpi_periods` require the existing
`mokara:read` permission. `record_business_kpi_check_in` requires `mokara:write`
plus current goal-level contribution permission. Legacy weighted-task KPI tools
remain unchanged; no execution permission is implied by reading or recording data.

The tools use the actual authenticated domain routes in-process, after rechecking
connection workspace allowlists and membership. Personal goals stay private.
The single-goal read uses `GET /api/teams/:workspace/kpi-goals/:goal`.
List/history routes now accept optional `limit` from 1 to 20; their web defaults
remain 20 and MCP defaults to 10. Listing through MCP omits the editor's member
options. Review results remain bounded to 30 observation dates.

A check-in needs an absolute decimal-string result, actual observation date,
current revision and a source attribution. The attribution is saved in the history
note; it is not independent verification by Mokara. Clients must have explicit
user intent and a supplied or verified figure, rather than guessing from task
completion. Unknown or unavailable source data should be reported instead of
submitting an estimate.

The goal update and retry record commit together through the existing KPI service.
These check-ins use native KPI history, not `list_operations`. Retry the same UUID
and payload, and verify through the goal/history tools. Source text is part of the
payload, so changing it also conflicts with a prior accepted request. Current
scope, membership and visibility are rechecked before replay. Replaying returns
the earlier result without submitting another check-in. Each MCP attempt consumes the normal
write-rate budget. No new scope, migration, provider or environment variable is
needed. A read-only connection must receive user-approved write access before it
can use the check-in tool.

Full tool schemas, example arguments and recovery rules are documented in
[mcp.md](mcp.md). Public `/docs/mcp` lists all 72 tools and includes the business
workflow. Downloadable `/skills/mokara/SKILL.md` version 1.2.0 includes the same
source, permission and retry rules. Tools to create goals, edit targets or create
periods are outside this phase.

## Remaining phases

Automatic data imports, automatic recurring periods,
attachments, forecast health and a task-contribution redesign
are not included. The broader KPI proposal remains open for those follow-ups.

## Local QA record, 2026-10-29

- Applied all 47 migrations to an empty isolated PostgreSQL 16 QA database and
  the additive migration to the existing local dummy preview database.
- Focused KPI unit and actual PostgreSQL tests: 20 passed. Includes independent
  concurrent writes against one revision, identical retries, permissions, backdated
  observations, paging, strict HTTP inputs and legacy weighted results.
- Frontend regression tests: 146 passed. Backend regression tests under Node
  24.19.0 with `--test-concurrency=1`: 426 passed, two database-gated suites skipped.
  The KPI database suite was run separately with its isolated database configured.
- All five package type checks, Prisma validation, architecture checks, environment
  examples, version consistency and changed-file formatting passed. ESLint has
  five existing image warnings and no errors.
- Browser checks used seeded local dummy accounts. Created personal and shared
  money goals, checked contributor access, privacy, history attribution, Team-page
  availability and saved results after restarting the API. A stopped API showed
  the shared error message; Refresh KPIs restored persisted results after restart.
  Create forms and cards fit 390, 1280, 1440, 1600 and 1920 pixel viewports.
- Parallel backend test-file execution intermittently failed while decoding the
  admin-monitoring test process output, before reporting that file's assertions.
  Sequential execution completed. No unrelated admin code was changed; this
  runner limitation is not considered fixed by the passing sequential run.
- Production builds remain CI-owned. No Git push, deployment or release was made.

## Phase-two QA record, 2026-10-29

- KPI unit and real PostgreSQL tests: 23 passed, including review authorization,
  same-date corrections, decreasing targets, 30-date paging, equal timestamps,
  malformed/cross-goal cursors and revision conflicts after new writes.
- Frontend regression suite: 152 passed. All five package type checks passed.
  Architecture passed for 201 modules. Formatting, environment examples and
  version consistency passed; lint retains five existing image warnings.
- Backend assertions passed when the unchanged admin-monitoring file was run
  separately: 390 other tests plus 36 admin tests, with two database-gated skips.
  Combined execution still intermittently fails while decoding that file's test
  process output, even sequentially. This runner issue remains unresolved.
- Browser verification used the existing isolated dummy workspace. Its sales
  review showed observations of MYR 3,000, 6,000 and 9,000 on October 10, 20 and
  29, with a +15 percentage-point comparison for the latest two dates. Backdated
  uploads retained the current MYR 9,000 result. Refresh preserved the review.
  The 390px layout kept chart labels readable and table scrolling worked with
  the keyboard; 1280/1440/1600/1920 layouts had no page overflow.
- No new migration or environment settings, no production build, push or release.

## Phase-three QA record, 2026-10-29

- Applied all 48 migrations successfully to a new empty PostgreSQL 16 QA database,
  and the additive period migration to the existing isolated dummy preview.
- KPI unit/PostgreSQL tests: 27 passed. Covers distinct targets/results, unchanged
  source history, same-request replay, changed-payload conflicts, simultaneous
  different requests creating exactly one successor, stale revisions, overlap,
  foreign members, private access, strict HTTP creation and database link checks.
- Frontend regression tests: 156 passed. Includes month/year/leap boundaries,
  quarterly presets, explicit confirmation, unreported comparisons, exact values
  and compatibility with snapshots created before period links existed.
- Five package type checks, Prisma validation, architecture for 204 modules,
  environment/version checks and changed-file formatting passed. ESLint reports
  five existing image warnings and no errors. Backend assertions pass in the
  documented split invocation: 390 other tests and 36 admin tests; two database
  suites are skipped there and the KPI database suite was run separately.
- Browser dummy accounts verified contributor read-only comparison, personal and
  shared next-period creation, quarterly date changes, future periods without
  copied results, previous/next navigation, saved-state refresh and personal
  period isolation from the workspace owner. October stayed at its previous
  measured value and MYR 20,000 target; November started unreported at MYR 25,000.
  Mobile forms fit 390px; comparison scrolling worked by keyboard. Desktop
  1280/1440/1600/1920 views had no page overflow.
- No new environment variables, production build, push, PR, deployment or release.

## Phase-four QA record, 2026-10-29

- Native KPI and authenticated MCP/PostgreSQL suites: 36 tests passed. The MCP
  suite uses real credential rows, scope filtering, membership checks, domain
  routes, MCP HTTP transport and database transactions. Only the Redis rate-limit
  provider is stubbed. It verifies the 72-tool catalog, read-only grants, private
  goals, revoked access, contributor permissions, exact decimals, concurrent
  retries, source attribution, stale revisions and bounded pagination.
- Existing MCP regression tests: 38 passed. Backend assertions also passed in
  the established split invocation, 390 other tests and 36 admin tests with three
  database-gated skips. KPI/MCP database suites were run separately as above;
  the older combined-runner decoding issue is not claimed fixed.
- Frontend regression tests: 156 passed. The focused documentation checks also
  passed after updating the skill download label, verifying that its version
  matches the actual downloadable asset and the catalog has 72 unique tools.
- All five package type checks, architecture for 204 modules, changed formatting,
  environment examples, version consistency and whitespace checks passed. Lint
  retains five existing image warnings and no errors. Public guide rendering
  was checked in the browser at desktop and 390px without page overflow.
- Public guide and downloadable skill updated locally. No additional migration,
  environment setting, external client setup, production build, push or release.
  External clients have not been tested against a deployed instance of this phase.

## KPI presentation refinement, 2026-10-29

The overview now separates recorded values, targets, observation dates and owners.
Check-in and trend review remain primary card actions; More contains reporting
periods, history and editing. Action disclosures close after selection, and the
opened panel receives focus. Period comparisons use labeled cards that stack on
mobile instead of a horizontally scrolling table. Detailed comparison caveats
remain available under About this comparison.

Task-based KPIs receive clearer headings, a How weights work explanation,
accessible progress bars, readable labels and thin scrolling. Their routes, task
bindings, visibility and calculation are unchanged: done=1, in_progress=0.5,
todo=0; canceled bindings are excluded. The weighted average is rounded to the
nearest whole percent and a goal without bindings stays at 0%. These presentation
changes do not add business targets, periods or manual check-ins to legacy KPIs.
