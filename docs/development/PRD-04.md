# PRD-04: Team Analytics (Activity Line Chart + Progress Tracker)

**Status:** Draft
**Owner:** TBD
**Depends on:** PRD-02 (auth + teams), PRD-01 (tasks)
**Last updated:** 2026-08-21
**Companion mockup:** `docs/design/analytics-mockup.html` (interactive; dummy data)

---

## 1. Overview

v4 adds a team-scoped **Analytics** page, reachable from a new sidebar item.
It answers one question well: _how does work flow through this team over
time?_ The centerpiece is a **single smooth multi-line chart** comparing
**created / in-progress / completed / canceled** — each line plots the
series' **7-day rolling average** so it curves continuously like a normal
analytics chart (raw integer daily counts at small-team scale would produce
horizontal plateaus) — with **tick-to-compare series filters** so any subset
of lines can be compared — plus a Linear-style **segmented progress bar**
for the current snapshot. No stat cards.

Two foundations make the chart honest:

1. A new **`task_events` activity log** — one row per status transition.
   The existing schema only stores each task's _current_ status, so a
   time-series of "when did things move" is impossible without it.
2. A new **`canceled` task status** — the user explicitly wants canceled
   work visible in the comparison, and it doesn't exist yet.

Design reference: Linear's progress tracker aesthetic — hairline grid, thin
smooth lines, dots and tooltip only on hover, muted chrome.

## 2. Goals

- Add `canceled` as a first-class task status across backend + frontend.
- Record every status transition in `task_events` (and task creation).
- Ship `GET /api/teams/:id/analytics` returning daily-bucketed series +
  7-day rolling-average trend values + current totals, server-side
  bucketed, zero-filled.
- New `/analytics` page: sidebar entry, team selector, segmented progress
  bar, and the smooth 4-line trend chart (7-day rolling averages) with
  per-series tick filters and a 7d/30d/90d range toggle.
- Keep analytics a plain fetch-on-load page — no polling/SSE (staleness is
  acceptable here; the SSE channel from PRD-03 stays reserved for live
  surfaces).

## 3. Out of Scope (v4)

- Per-member breakdowns, burndown/velocity forecasts, CSV export.
- Cumulative mode (running totals) — v2 idea.
- Weekly/monthly bucketing — daily only, ranges capped at 90d.
- Realtime chart updates (SSE/polling).
- Analytics for anything other than task status flow (comments, logins…).
- Notifications — renumbered to **PRD-05** (was informally "PRD-04" earlier).

## 4. Core Features

| #   | Feature                 | Description                                                                                                                                                                                                                                   |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `canceled` status       | Added to backend enum, frontend `TaskStatus`, status dropdown, glyph, labels, filters.                                                                                                                                                        |
| F2  | Activity log            | `task_events` row on task create (`null → <status>`) and on every status change (`from → to`).                                                                                                                                                |
| F3  | Backfill                | Migration seeds events for pre-existing tasks (see §6).                                                                                                                                                                                       |
| F4  | Analytics endpoint      | `GET /api/teams/:id/analytics?range=7\|30\|90` — daily series + current totals, members only.                                                                                                                                                 |
| F5  | Sidebar entry + page    | `Analytics` nav item in `AppShell`; `/analytics` route with team selector (same pattern as tasks).                                                                                                                                            |
| F6  | Segmented progress bar  | Linear-style single bar: completed / in-progress / open / canceled proportions + legend counts + completion %.                                                                                                                                |
| F7  | Smooth multi-line chart | One graph, four **smooth (monotone) trend lines** — each line plots the series' **7-day rolling average**, so lines curve continuously with no horizontal segments. Hover crosshair + tooltip show the raw daily count alongside the average. |
| F8  | Tick-to-compare filters | Each series has a toggle chip (✓ when on). Ticking off removes the line, its tooltip row, and rescales the y-axis.                                                                                                                            |
| F9  | Range toggle            | 7d / 30d / 90d segmented control; refetch on change.                                                                                                                                                                                          |

## 5. Tech Stack (additions vs PRD-03)

| Layer    | Addition                                    | Why                                                                                                                                                                                     |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | `recharts` **`^3.10.1`**                    | React 19 compatible; `LineChart` + `type="monotone"` gives the smooth Linear look with minimal API. No chart lib in the global reference stack — this pin becomes the project standard. |
| CSS      | `--color-created: #0ea5e9` (+ soft variant) | New token for the "created" series; no existing token is distinct enough from accent indigo.                                                                                            |

Backend has **no new dependencies**.

## 6. Data Model

### `tasks.status` — new value

`canceled` joins `todo | in_progress | done`. Column stays `text` (no enum
migration); the change is in validation + UI surfaces:

- backend: `taskStatusSchema` enum, `updateTaskSchema` passthrough
- frontend: `TaskStatus` type, `STATUS_LABEL`, `StatusGlyph` (✕-circle in
  `--color-danger`), status dropdown menu, new-task modal
- tasks page filters: `active`/`today`/`week` **exclude** canceled; a new
  collapsed **"Canceled" group** renders below Done (assumption §11.2)

### `task_events` (new table)

| Column        | Type          | Constraints                                  | Notes                                                       |
| ------------- | ------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `id`          | `uuid`        | PK, default `gen_random_uuid()`              |                                                             |
| `team_id`     | `uuid`        | NOT NULL, FK → `teams(id)` ON DELETE CASCADE | Denormalized for cheap team queries.                        |
| `task_id`     | `uuid`        | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE | Deleted tasks take their history with them (v1 simplicity). |
| `actor_id`    | `uuid`        | NOT NULL, FK → `users(id)`                   | Who caused the transition.                                  |
| `from_status` | `text`        | nullable                                     | `null` on creation events.                                  |
| `to_status`   | `text`        | NOT NULL                                     |                                                             |
| `created_at`  | `timestamptz` | NOT NULL, default `now()`                    | When the transition happened.                               |

Indexes: `@@index([team_id, created_at])` (the analytics query),
`@@index([task_id])` (cascade + per-task lookups).

**Write points** (backend only — never trust the client for history):

- `POST /teams/:id/tasks` → event `(null → <initial status>)`
- `PATCH /tasks/:id` where `status` actually changes → event `(old → new)`
  (the frontend quick-toggle goes through this same PATCH)

**Backfill** (best-effort, documented as approximate; shipped as two
migrations — the second added after the first release omitted
in-progress and that series rendered flat):

- every existing task → `(null → todo)` at `created_at`
- tasks currently `done` → `(todo → done)` at `updated_at`
- tasks currently `in_progress` → `(todo → in_progress)` at `updated_at`
- tasks currently `canceled`… none exist pre-migration; nothing to do

### Event volume sanity

3-member teams, tens of tasks: a few hundred events per team per month.
No partitioning, no retention policy, no aggregation tables. If a team ever
crosses ~100k events, revisit (v3+ concern).

## 7. API

| Method | Path                       | Auth         | Notes                                    |
| ------ | -------------------------- | ------------ | ---------------------------------------- |
| GET    | `/api/teams/:id/analytics` | yes (member) | `?range=7\|30\|90` (default 30, clamped) |

Response (snake_case, new `toAnalytics()` mapper):

```json
{
  "range": 30,
  "series": [
    {
      "date": "2026-08-21",
      "created": 3,
      "in_progress": 1,
      "completed": 2,
      "canceled": 0,
      "created_avg": 2.4,
      "in_progress_avg": 1.6,
      "completed_avg": 2.1,
      "canceled_avg": 0.4
    }
  ],
  "totals": { "open": 5, "in_progress": 2, "completed": 12, "canceled": 3 }
}
```

- `series`: one row per calendar day in the range (inclusive today),
  oldest → newest, **zero-filled** so lines are continuous.
  - `created` = events with `from_status IS NULL` that day
  - `in_progress` / `completed` / `canceled` = events with
    `to_status = '<status>'` that day (`completed` counts `done`)
  - `<key>_avg` = trailing 7-day average of the raw count (day inclusive),
    computed server-side over **full team history** so values at the left
    edge of the window are correct, not truncated. Fractional by design —
    consecutive averages never tie, which is what eliminates the horizontal
    segments raw integer counts produce.
- `totals`: **current** snapshot from the `tasks` table (not events):
  `open` = `todo`, plus live counts per other status.
- Bucketing in SQL (`date_trunc('day', created_at)` + `GROUP BY`), not in JS.
- Errors reuse the contract: `not_found` / `forbidden` like other team routes.

## 8. Frontend Design

### Sidebar (`components/AppShell.tsx`)

New entry in `navItems` after Tasks: `Analytics`, line-chart icon, same
active-pill treatment. Route: `/analytics`.

### Page layout (top → bottom)

1. **Header row** — title + subtitle; right side: team selector pill +
   7d/30d/90d segmented control.
2. **Progress card** — segmented bar + legend (F6). Completion % =
   `completed / (open + in_progress + completed + canceled)`.
3. **Chart card** —
   - header: "Activity over time" + **series filter chips** (F8)
   - body: `ResponsiveContainer` + `LineChart`, one `Line` per series with
     `dataKey="<key>_avg"`, `type="monotone"`, `strokeWidth={1.6}`,
     `dot={false}`, `activeDot={{ r: 3.5 }}` (dots only on hover — Linear look)
   - `CartesianGrid` horizontal-only, `stroke` = `--color-border-soft`
   - `YAxis` decimals allowed (averages are fractional), width-capped,
     faint tick color
   - `XAxis` ~5 date labels
   - custom dark `Tooltip` (ink bg) per series: raw daily count + 7-day
     average; crosshair via `cursor={{ stroke }}`

### Series filter chips (tick-to-compare)

- One chip per series: colored dot + label + checkmark when enabled
  (checkmark convention mirrors the app's dropdown menus).
- Click toggles the series: line unmounts, tooltip row disappears, y-axis
  rescales to the visible max.
- Default: all four on. If the last chip is ticked off, render an inline
  hint ("tick a series to compare") instead of an empty grid.
- Client-side only — the endpoint always returns all four series.

### Colors

| Series      | Token                       |
| ----------- | --------------------------- |
| Created     | `--color-created` `#0ea5e9` |
| In progress | `--color-warning` `#a16207` |
| Completed   | `--color-accent` `#6366f1`  |
| Canceled    | `--color-danger` `#ef4444`  |

Progress-bar "open" segment: `rgba(148,163,184,0.55)` (neutral slate).

### Data fetching

Plain `useEffect` fetch on mount / team change / range change; loading =
skeleton shimmer rows; error = retry line (same pattern as other pages).
No React Query (consistent with PRD-03 decision).

## 9. Phased Implementation Plan

Each phase verified with `pnpm typecheck` + `pnpm lint` + `pnpm format`
before the next begins.

### Phase 1 — `canceled` status + activity log

1. Migration: `task_events` table + backfill inserts (§6).
2. Backend: extend `taskStatusSchema`; write events in POST create + PATCH
   status-diff; `toAnalytics` not needed yet.
3. Frontend: `TaskStatus` + labels + glyph (✕-circle, danger) + dropdown +
   new-task modal + tasks-page "Canceled" group + filter exclusions.
4. **Verify:** change a status, inspect `task_events` rows; two-browser
   smoke; typecheck/lint/format.

### Phase 2 — analytics endpoint

1. `GET /api/teams/:id/analytics` with SQL bucketing + zero-fill + totals.
2. **Verify:** curl with cookie across ranges; compare against manual SQL
   counts; typecheck/lint/format.

### Phase 3 — analytics page

1. `recharts ^3.10.1` + `--color-created` token.
2. `AppShell` nav item; `/analytics` page: team selector, progress card,
   chart card with monotone lines, tick-to-compare chips, range toggle,
   hover tooltip per mockup.
3. **Verify:** typecheck/lint/format; manual — toggle chips rescale y-axis,
   ranges refetch, empty-team state, non-member gets forbidden.

### Phase 4 — polish + handoff

1. Visual pass against `docs/design/analytics-mockup.html`.
2. PRD-05 (notifications) picks up the SSE channel from PRD-03 unchanged.

## 10. Open Questions / Assumptions

1. **Lines plot the 7-day rolling average; raw daily counts live in the
   tooltip.** Raw integer counts at 3-member-team scale produce horizontal
   plateaus (consecutive equal days), which the user rejected; fractional
   averages curve continuously like a normal analytics chart. Cumulative
   mode deferred (v2 idea).
2. **Canceled tasks on the tasks page** — own collapsed group below Done;
   excluded from `active`/`today`/`week` filters.
3. **Backfill is approximate** — done and in-progress tasks get synthesized
   transitions at `updated_at`; exact pre-log history is unknowable. Accepted.
4. **Notifications renumbered to PRD-05.**
5. **Progress bar stays** (it's the Linear-vibe piece; not a stat card).
6. **Smoothing = monotone** (recharts) over the averaged points — no
   overshoot, unlike catmull-rom which can dip below zero visually.
7. **Series filters are client-side**; endpoint always returns all series.
8. **Deleted tasks remove their history** (cascade) — v1 simplicity; noted
   so nobody is surprised later.
9. **All members see identical analytics** (no owner-only view) — same
   membership rule as tasks.
