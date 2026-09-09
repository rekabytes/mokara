# PRD-13 — First-run spotlight tour

> **Status (2026-09-09): BUILT, uncommitted, gates green.** The owner picked
> Option C from `docs/design/onboarding-guide-mockup.html` and said proceed; the
> six §10 questions went unanswered, so each was resolved by its own
> recommendation and is recorded as an assumption in §13.1 — any of them can
> still be flipped, and §13.1 says what each flip costs. §13.2 records where the
> build deviated from this document, with reasons.
>
> **Not built / deliberately out:** the `/guide` help centre (Option B) and the
> first-run checklist card (Option A) · a task-drawer step (needs the
> `?task=<id>` deep link, §11) · a replay affordance · wiring the dead controls
> of §7.1.
>
> **Owner steps before this can be seen:** restart the backend — `tsx watch`
> does not reload the generated Prisma client, so the running process still
> holds a client without `tourState` and will fail the new selects — then open
> `/tasks`. Every existing user is at `NULL`, so everyone sees the tour once,
> which is §13.1 decision 5 working as asked.
>
> Mockup: `docs/design/onboarding-guide-mockup.html` section 03.

## 1. What we are building

A five-step coach-mark tour that runs over the real `/tasks` page on a user's
first arrival: dim the app, cut a hole around one control, explain it, next.
Dismissal is written to Postgres, so it follows the user across devices and
browsers — the same reason `last_container_id` is a column and not
`localStorage` (cookie policy: one session cookie, no device storage).

The tour is **not** a modal wizard and **not** a separate route. It is an
overlay on the page the user is already looking at, and every step points at a
control that exists on a brand-new account.

Rejected alongside it (owner picked C): the `/guide` help centre (Option B) and
the first-run checklist card (Option A). Neither is cancelled by this document —
they are independent, and A/B remain the better homes for long-form content.
§11 records the interaction between them.

## 2. The visibility rule (the whole feature in one predicate)

Show the tour only when **all five** hold:

1. the session probe has resolved and the user is authed;
2. `user.tour_state` is `null`;
3. `pathname === "/tasks"`;
4. the board has finished loading (never coach over a spinner);
5. the viewport is at or above the desktop breakpoint (800px — see §7.5).

Everything else hides it. The predicate is a **pure exported function**
(`shouldRunTour`) so it can be truth-tabled in a one-shot `tsx` script without a
browser or a server (§9).

`tour_state` values and their meaning:

| `tour_state` | Meaning                                               | Tour shows? |
| ------------ | ----------------------------------------------------- | ----------- |
| `NULL`       | never resolved — fresh account, or abandoned mid-tour | **yes**     |
| `completed`  | reached the last step and pressed Finish              | no          |
| `skipped`    | pressed Skip, the close button, or `Esc`              | no          |

Note the deliberate asymmetry: **closing the tab mid-tour leaves `NULL`**, so
the tour restarts on the next load. That is honest (they never finished) but it
is a decision, not an accident — see §10.3.

## 3. Persistence

### 3.1 Column

One nullable TEXT column on `users` plus a DB CHECK, matching how every other
enum-shaped value in this schema is done (`plan`, `plan_override`, `Team.kind`,
task status):

```sql
ALTER TABLE "users" ADD COLUMN "tour_state" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_tour_state_check"
  CHECK ("tour_state" IS NULL OR "tour_state" IN ('completed', 'skipped'));
```

Prisma: `tourState String? @map("tour_state")`, with a comment naming the two
writers' absence — there is exactly **one** writer (the endpoint in §4), which
is the lesson `plan`/`plan_override` taught the hard way.

`NULL` for every existing row, so the migration needs no backfill and changes
no behaviour on deploy _except_ that every current user sees the tour once
(§7.6 — that is what the owner asked for, but it is called out because it
includes the demo accounts and his own).

**Migration number:** 27 (`20260909140000_plan_override`) is head. The
stale-plan cleanup floated in `.pi/state.md` would also be 28 — whichever lands
first takes the number, and the release gate replays all of them on an empty
Postgres, so order matters only for the directory name.

### 3.2 Optional second column

A `tour_resolved_at TIMESTAMPTZ NULL` beside it answers _when_, which is the
only way to ever measure drop-off or tell a 2026 skip from a 2027 one. It costs
one line in the same migration. Recommendation: **include it** (§10.2).

## 4. API surface

### 4.1 Write

`PATCH /api/me/onboarding`, body `{ "state": "completed" | "skipped" }` → 204.

Follows the `PUT /me/last-container` precedent exactly, because the same
constraint applies (a standalone `Context` parameter cannot carry the
validated-json type an inline handler infers):

- Zod **strict** schema in `packages/backend/src/lib/validation.ts`:
  `z.object({ state: z.enum(["completed", "skipped"]) }).strict()`;
- exported helper `setTourState(userId, state)` in `routes/auth.ts`;
- inline route in `index.ts` beside `PATCH /me` and `PUT /me/last-container`.

**Idempotent**: writing the same state twice is 204, not an error. **No reset
in v1** — the enum has no `null`, so nothing session-reachable can put the tour
back. Adding a replay later is one `.nullable()` plus a Settings line (§11).

Authorisation is the auth middleware; there is no resource to check ownership
of, so no per-route authorisation beyond it.

### 4.2 Read — and why `toUser` must NOT be widened

`tour_state` has to reach the client through `GET /api/auth/me`, which the
frontend already probes once per app lifetime. The trap:

`toUser()` in `packages/backend/src/lib/types.ts` is used in **two** roles —
the session user (signup `auth.ts:60`, login `:87`, `updateMe` `:182`,
`meHandler` `:210`) **and** nested authorship inside `toComment()` (`:272`).
Widening its `Pick<>` to include `tourState` would force every comment query to
select the column and would **leak a user's onboarding state into every comment
payload**. So:

- add `toMe(u)` = `{ ...toUser(u), tour_state, tour_resolved_at }` typed
  `MeResponse`, and switch **only the four session-user call sites** to it;
- `toUser` / `toUserRef` / `toComment` stay untouched.

### 4.3 Frontend types — the same split, or the types lie

`packages/frontend/lib/api.ts` types `Comment.author` as `User`. Adding
`tour_state` to `User` would declare a field that comment payloads never carry.
So:

```ts
export type TourState = "completed" | "skipped";
export type User = { id; username; display_name; created_at }; // unchanged
export type SessionUser = User & {
  tour_state: TourState | null;
  tour_resolved_at: string | null;
};
```

`lib/session.ts` moves to `SessionUser` (its `setSessionUser`, its atom, and
`api.me()` / `login` / `signup` / `updateMe` return types). The tasks page keeps
passing `currentUser` into `AttachmentsSection` / `CommentsSection`, whose props
stay `User | null` — a `SessionUser` satisfies them structurally, so those call
sites need no edit.

`lib/api.ts` gains `patchTourState(state: TourState): Promise<void>`.

## 5. The five steps

Copy names the control by its **on-screen label** in its real casing, and never
names a control that does nothing (§7.1). Targets are the `data-tour` contract
in §6.1.

| #   | Target               | Headline                            | Body                                                                                                                                                                     |
| --- | -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `container-switcher` | This is your workspace              | `Personal` is private to you — the padlock means nobody else can see it. Open this to switch or create another. The moment someone accepts an invite, it becomes a team. |
| 2   | `create-task`        | Everything starts with a task       | A title is the only required field. Steps you add here become the task's Checklist, and files attached here stay on the task.                                            |
| 3   | `board-controls`     | Narrow the board                    | `Active` · `Today` · `This week` · `Done` choose what is on screen; the dropdown beside them sorts by `Manual`, `Priority` or `Due date`. Both remember themselves.      |
| 4   | `notifications-bell` | Invitations and deadlines land here | Teammates invite you by `@username` — `Accept` sits right on the row. Tasks due within 48 hours turn up here too, red once they are overdue.                             |
| 5   | `nav-team`           | Projects, KPIs and people           | The Team page is where projects and KPIs are created and where you invite people. Tasks borrow them from the `…` panel in the drawer.                                    |

Buttons: `Back` (hidden on step 1) · `Skip tour` · `Next`, and on step 5
`Start using Mokara` (writes `completed`). Five dots show position.

### 5.1 Step 2 has two targets — and this is not a detail

A **fresh account renders the empty state**, not the board: when
`totalTasks === 0` the page prints `No tasks yet` / `Capture a thought, get it
done.` with a `Create your first task` button, and **the group headers — including
the Todo `+` — do not exist at all** (`tasks/page.tsx:641-656`). The mockup's
spotlight on the Todo `+` is therefore the _populated_-board case only.

So `data-tour="create-task"` goes on **both** the empty-state button and the
Todo group's `+`, and the tour takes the first one that exists. The filter row
(step 3) renders _above_ that branch, so it is present in both cases — no
branching needed there. The step list is a function of board state, not a
constant array.

## 6. Overlay mechanics

### 6.1 The target contract: `data-tour`

Targets are found by `document.querySelector('[data-tour="…"]')` — explicit,
greppable, and decoupled from `aria-label` strings that may be reworded. Five
attributes to add:

| `data-tour`          | File                                                          |
| -------------------- | ------------------------------------------------------------- |
| `container-switcher` | `components/ContainerSwitcher.tsx` (trigger)                  |
| `create-task`        | `app/(app)/tasks/page.tsx` (empty-state CTA **and** Todo `+`) |
| `board-controls`     | `app/(app)/tasks/page.tsx` (filter row)                       |
| `notifications-bell` | `components/NotificationBell.tsx`                             |
| `nav-team`           | `components/AppShell.tsx` (Team nav leaf)                     |

A missing target **skips that step** rather than throwing (§7.2).

### 6.2 Mount, scrim, spotlight

- Mounted **once in `AppShell`**, beside `<NotificationDrawer />`, following the
  same precedent (a single instance app-wide, started only when
  `pathname === "/tasks"`).
- No portal needed: the drawer precedent is a `fixed z-50` element rendered in
  the shell. The tour sits at `z-[60]` so it covers the drawer.
- Scrim = one `fixed inset-0` layer; the **hole** is a `fixed` div positioned at
  the target's `getBoundingClientRect()` with
  `box-shadow: 0 0 0 9999px rgba(15,23,42,0.44)` and a `--radius-*` corner. No
  SVG mask, no extra dependency, no second paint layer.
- The scrim blocks pointer events, so **nothing else can be clicked mid-tour** —
  no container switch, no drawer, no navigation. That removes a whole class of
  re-measurement problems.
- Measurement: on step change and on window `resize`; plus
  `scrollIntoView({ block: "nearest" })` before measuring, because the Todo `+`
  lives inside the board's own scroll container (`/tasks` locks the page and
  scrolls internally). One `useEffect` with the listeners, commented with what
  it syncs (DOM measurement — the canonical allowed reason).
- Popover placement: beside/below the hole, flipped when it would leave the
  viewport — the same measured-position discipline the `Dropdown` uses, and
  **never cleared on close** (that flashes the exit frame).

### 6.3 Motion

All constants in `lib/motion.ts` (`tourScrimVariants`, `tourCardVariants`, and
the spotlight's rect transition using the existing `snap()`/`DUR`). Presence is
`AnimatePresence`-driven — no timers, no unmount rigs.

One real gotcha: `MotionProvider` sets `reducedMotion: "user"`, which drops
**transform and opacity** only. The spotlight animates `width`/`height`/`x`/`y`
of a fixed box, so reduced motion would _not_ calm it. Gate the rect tween on
`useReducedMotion()` and jump the hole instead of animating it.

### 6.4 Accessibility & keyboard

- `role="dialog"` `aria-modal="true"`, `aria-label="Product tour"`; the popover
  takes focus on open and the three buttons are the tab ring.
- Step counter announced via `aria-live="polite"` (`Step 2 of 5`).
- `Esc` = skip (writes `skipped`). No conflict: the scrim means nothing else is
  open, and the tour's own listener is the only one that fires.
- `Enter` on the focused button does what it says; no other shortcuts.

### 6.5 CSP

Enforced CSP is unaffected: no new origins, no inline script, and
`style-src 'unsafe-inline'` is already load-bearing for framer-motion style
attributes. Nothing here adds a subresource.

## 7. Failure modes and edge cases

1. **Never point at a dead control.** The breadcrumb `Star`, the `Filter
settings` gear, the `Filter` funnel, `Layout` and the modal's `Expand` all
   render with no handler (`IconButton` does not even accept `onClick`). None is
   a tour target, and no step copy mentions them. If they are wired later, they
   become candidates — not before.
2. **A missing target must not break the app.** If `querySelector` returns
   `null` (a redesign moved it, the board is in a state where it does not
   render), the step is skipped and the tour continues; if _no_ target resolves,
   the tour does not start. A tour that crashes `/tasks` is worse than no tour.
3. **The PATCH is fire-and-forget.** Same posture as `selectContainer` →
   `PUT /me/last-container`: hide the tour locally, write in the background,
   never block the user on it, and let `lib/api.ts` log a failure. Consequence,
   stated honestly: if the write fails the tour reappears on next load. The
   alternative (an `ErrorBanner` on the way out of an onboarding overlay) is
   worse.
4. **Multi-tab.** Two tabs open a fresh account → both show the tour; finishing
   in one does not stop the other (no SSE event for this, and adding one would
   be over-engineering). The next load in the second tab is correct.
5. **Mobile (<800px).** The sidebar is a slide-in drawer, so targets 1 and 5 do
   not exist. Recommendation: **do not run the tour below 800px and leave
   `tour_state` NULL** — a server-side flag means it still appears the first
   time they use a desktop, which is the nice property of storing this in the
   database rather than in the device. Alternative: a reduced 3-step variant
   (steps 2–4) that writes `completed` and never shows the rest. §10.4.
6. **Every existing user sees it once on deploy**, because `NULL` is the
   default — mira/jonas/priya, the audit leftover, and the owner. That is what
   "fresh account or anything, make it show" means, but if he would rather
   grandfather accounts that predate the feature, the migration backfills
   `tour_state = 'skipped'` for rows created before it. One line, his call.
   §10.5.
7. **Switching user in the same tab.** Login/signup call `setSessionUser`, and
   the tour's own open/closed state is component state — so mount it as
   `<TourOverlay key={sessionUser.id} />`. A remount on identity change is the
   clean reset; mirroring it in an effect is the bug class this repo already
   ruled out.
8. **Backend restart is required after `pnpm db:generate`** — `tsx watch` does
   not reload `.env` or the generated Prisma client, so the running process will
   keep failing the new select until the owner restarts it. (Same trap as the
   grant-model deploy.)

## 8. File-by-file change list

**db**

1. `packages/db/prisma/migrations/<ts>_tour_state/migration.sql` — new, §3.1.
2. `packages/db/prisma/schema.prisma` — `tourState String? @map("tour_state")`
   (+ `tourResolvedAt` if §10.2 says yes).

**backend** 3. `src/lib/validation.ts` — `tourStateSchema` (strict, `z.enum`). 4. `src/lib/types.ts` — `MeResponse` + `toMe()`; `toUser` untouched. 5. `src/routes/auth.ts` — `setTourState()` helper; the four session-user call
sites switch to `toMe` and widen their `select`. 6. `src/index.ts` — inline `authed.patch("/me/onboarding", …)` beside
`PUT /me/last-container`.

**frontend** 7. `lib/api.ts` — `TourState`, `SessionUser`, `patchTourState`, and the four
session endpoints re-typed to `SessionUser`. 8. `lib/session.ts` — atom/`setSessionUser`/`useSession` move to `SessionUser`,
plus a `setSessionTourState(state)` that patches the atom after a successful
write (so a second tour cannot start in the same session). 9. `lib/onboarding.ts` — **new**: the step table (copy + `data-tour` id), the
`stepsFor({ hasTasks })` branch, and the pure `shouldRunTour()` predicate. 10. `components/TourOverlay.tsx` — **new**: scrim, spotlight, coach card,
measurement effect, PATCH on Finish/Skip. 11. `components/AppShell.tsx` — mount it once, keyed by user id; add
`data-tour="nav-team"`. 12. `components/ContainerSwitcher.tsx`, `components/NotificationBell.tsx`,
`app/(app)/tasks/page.tsx` — the four `data-tour` attributes. 13. `lib/motion.ts` — `tourScrimVariants`, `tourCardVariants`, spotlight
transition.

**docs** 14. this file (promoted from DRAFT once §10 is answered) and a line in
`docs/design/system.md` §9 if the spotlight becomes a reusable recipe.

No new dependencies. No env vars. No Redis keys. No SSE events.

## 9. Verification without servers or builds

Owner rule: no `next build`, no curl against a running app, no HTTP probes.
What can be proven locally:

- **Gates:** `pnpm typecheck` (×5 workspaces) · `lint` · `format` ·
  `db:generate` · `db:migrate:deploy`; plus the CI fresh-checkout reproduction
  (`mv packages/frontend/next-env.d.ts /tmp && pnpm typecheck`, restore).
- **The visibility predicate**, as a one-shot `tsx` script over
  `shouldRunTour()`: `NULL` + `/tasks` + loaded + desktop → run; `completed` →
  no; `skipped` → no; `NULL` + `/analytics` → no; `NULL` + loading → no; `NULL`
  - mobile → no; anonymous → no.
- **The Zod schema**: accepts both values, rejects `null`/`"done"`/extra keys
  (strict).
- **The migration**: applied to the dev DB, then assert the column is nullable
  TEXT and the CHECK rejects a third value (a direct Prisma write in a throwaway
  script, rolled back).
- **The overlay**: cannot be verified headlessly here — `/tmp/mokara-shot`'s
  puppeteer-core install is broken (missing its `package.json`/entry point), and
  repairing it means an unprompted install. **The click-through is the owner's**,
  on a fresh account and on one with tasks, at 1280/1440/1600/1920.

**Blind spots to name up front:** hole alignment against the real rendered board
(only the browser can tell), the `scrollIntoView` behaviour inside the board's
own scroller, and reduced-motion feel. Those are exactly the things the gates
cannot see.

## 10. Open decisions — resolved 2026-09-09

All six were settled by their own recommendation when the owner said proceed
without choosing. Each is restated as an assumption, with what flipping it
costs, in §13.1.

1. **Step list and copy** (§5) — as drafted.
2. **`tour_resolved_at`** — included.
3. **Abandoning mid-tour** — stays `NULL`, so the tour restarts next load.
4. **Mobile** — no tour below 800px, state stays `NULL`.
5. **Existing users** — no backfill; everyone sees it once.
6. **Replay** — none in v1.

## 11. Out of scope

- **The task drawer is not toured.** There is no `/tasks?task=<id>` deep link,
  so a step cannot open a task on the user's behalf. Adding that link is a
  separate change with its own payoff — notification and due-soon rows currently
  can only switch container and push `/tasks`, which is the known UX-parity gap.
  If he wants a drawer step, the deep link comes first.
- **No long-form content.** The tour teaches five controls; it cannot carry
  chapters. Option B (`/guide`) is still the answer to "how do KPI weights
  work?" and step 5's copy is written so a link can be added later without a
  rewrite.
- **No checklist card (Option A)**, no analytics on tour drop-off beyond the
  timestamp in §3.2, no per-container tour state, no admin/console surface for
  resetting a user's tour, no translated copy (all strings live in one module so
  extraction later is mechanical).
- **No wiring of the dead controls** from §7.1. That is its own decision and
  belongs in a UI cleanup, not smuggled into an onboarding feature.

## 12. Phasing and commits

Two commits, because the first is independently verifiable and the second cannot
compile without it (owner commits, not the agent):

1. `feat(onboarding): persist tour state` — migration, schema, validation,
   `toMe`, the PATCH route, frontend types + `lib/onboarding.ts` predicate.
   Verifiable end to end with gates + the `tsx` truth table.
2. `feat(onboarding): first-run spotlight tour` — `TourOverlay`,
   `lib/tour-geometry.ts`, the motion constant, the `data-tour` attributes and
   the tasks-page mount. Verifiable only by the owner's click-through.

Both are built and sitting in one dirty tree; the split above is how to commit
them when the owner asks.

Release: rides whatever tag comes after `v0.1.7`; the gate replays every
migration on an empty Postgres, so the new column needs no release-workflow
change. Six manifests + doc examples on bump, as always.

## 13. As built (2026-09-09)

### 13.1 The six assumptions

| #   | Taken as                       | To flip it                                                                                                                       |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Steps and copy exactly as §5   | Copy lives in one array in `lib/onboarding.ts` — edit the string, nothing else.                                                  |
| 2   | `tour_resolved_at` included    | Drop the column in a new migration and the field from `toMe`/`SessionUser`; nothing reads it.                                    |
| 3   | Abandoning stays `NULL`        | Write `skipped` on the first dismissal instead — one line in `TourOverlay`'s `dismiss` call sites.                               |
| 4   | No tour below 800px            | `TOUR_MIN_WIDTH` in `lib/onboarding.ts`; a reduced variant also needs steps whose targets exist without the sidebar.             |
| 5   | No backfill — everyone sees it | One `UPDATE users SET tour_state='skipped' WHERE created_at < <migration time>`; would have to be migration 29 to be idempotent. |
| 6   | No replay                      | Widen `tourStateSchema` to accept `null`, clear the column in `setTourState`, add a Settings row.                                |

### 13.2 Deltas from this document, with reasons

1. **Mounted in the tasks page, not AppShell** (§6.2 said AppShell). The
   "never coach over a spinner" condition is the page's own load state; bridging
   it with a module atom would go stale on the way back from `/analytics`
   (the atom stays `true` while the page remounts in its `Loading…` state, so the
   tour could start against a board that does not exist yet). The page's
   `loading` starts `true` on every mount, so mounting here makes the ordering
   structural instead of something to remember. A dedicated `boardReady` state is
   written inside `loadTasks` — **not** `!loading`, because a failed load would
   then coach over an empty board that never arrived, and not a mirrored effect.
2. **`z-[70]`, not `z-[60]`** (§6.2). The portal'd `Dropdown` menus already sit
   at `z-[60]`; the tour has to clear them.
3. **The step list is a constant array, not `stepsFor({ hasTasks })`** (§5.1).
   Both create-task controls carry the same `data-tour="create-task"` and are
   mutually exclusive branches of one ternary, so `querySelector` resolves to
   whichever is on screen. Branching in data would have duplicated that decision.
4. **A third `create-task` target was added**: the `New task` button in the
   _filtered_ empty state. Reachable without it — the default filter is `active`,
   so a user whose tasks are all done or canceled renders `No open tasks`, where
   the Todo `+` does not exist and step 2 would have been silently skipped.
   The three are mutually exclusive, so the selector still resolves to one node.
5. **`board-controls` frames the filter pill group only**, not the whole filter
   row: the row also contains the gear, the funnel and the layout button, all
   dead (§7.1), and framing them is pointing at them. Step 3's copy was reworded
   to say "the dropdown at the other end of this row".
6. **`lib/tour-geometry.ts` was extracted** from the overlay (not in §8): the
   placement maths is the one part of this feature that can be asserted without a
   browser, and no screenshot rig is available (§9), so it was made pure and
   testable. This is what caught the bug in §13.4.
7. **`NavLeaf` gained an optional `tourId` prop** rather than a hardcoded
   attribute, because the Team leaf is rendered from a `teamItem` object and only
   that one leaf is a target.
8. **No `key={sessionUser.id}` remount** (§7.7 asked for one). The overlay lives
   inside the tasks page, so any identity change unmounts it: reaching `/login`
   means leaving `/tasks` (an expiry `redirect()` or a deliberate sign-out, which
   hard-navigates and reloads the document anyway), and signing back in mounts a
   fresh overlay with `index` 0 and `dismissed` false. The state that _does_
   outlive the page is the session atom, and login/signup replace that user
   wholesale — so the new user's own `tour_state` decides. A key would be a
   safeguard against a case the mount point already prevents.

### 13.3 Files as built

New: `packages/db/prisma/migrations/20260909180000_tour_state/migration.sql` ·
`packages/frontend/lib/onboarding.ts` · `packages/frontend/lib/tour-geometry.ts`
· `packages/frontend/components/TourOverlay.tsx` · this document.

Changed: `packages/db/prisma/schema.prisma` ·
`packages/backend/src/lib/validation.ts` · `packages/backend/src/lib/types.ts` ·
`packages/backend/src/routes/auth.ts` · `packages/backend/src/index.ts` ·
`packages/frontend/lib/api.ts` · `packages/frontend/lib/session.ts` ·
`packages/frontend/lib/motion.ts` · `packages/frontend/components/AppShell.tsx`
· `packages/frontend/components/ContainerSwitcher.tsx` ·
`packages/frontend/components/NotificationBell.tsx` ·
`packages/frontend/app/(app)/tasks/page.tsx`.

Migration landed as **28** (the stale-plan cleanup of `.pi/state.md` was not
approved, so it did not take the number). No new dependencies, no env vars, no
Redis keys, no SSE events.

### 13.4 Verification

- **Gates:** `pnpm typecheck` exit 0 across all five workspaces · `pnpm lint` 0
  errors (5 pre-existing `no-img-element` warnings, untouched) · `pnpm format`
  clean.
- **Database, live on dev:** migration 28 recorded in `_prisma_migrations`;
  `tour_state` is nullable TEXT, `tour_resolved_at` is nullable timestamptz(3);
  `users_tour_state_check` rejects `'done'` and accepts `'completed'` with a
  timestamp. Both probes ran inside a transaction and were rolled back, so `mira`
  is still `NULL`.
- **137 pure-function assertions, 0 failures** (one-shot `tsx`, no server, no
  browser): the 11-case visibility truth table, including `undefined` failing
  closed; step-table integrity; **the `data-tour` contract grepped out of the
  real source**, so a renamed attribute fails here instead of silently skipping a
  step; card placement inside the viewport for 6 hole positions × 3 preferred
  sides × 5 viewports from 800×700 to 1920×1080; the strict Zod schema (7 cases);
  `toMe` narrowing, including a garbage value reading as `null` rather than
  escalating; and `toUser` proving it still carries no tour field, which is the
  leak §4.2 exists to prevent.
- **One real bug found and fixed by that harness:** after flipping the card to
  the other side of the hole, nothing re-clamped it against the _right_ edge, so
  a target near that edge (the notification bell) on a 1280-wide window put the
  card partly off screen. Both axes now clamp with one two-sided
  `min(max(…, EDGE), viewport - size - EDGE)`, and the impossible-geometry case
  is a permanent assertion.

### 13.5 What no gate can see

Hole alignment against the real rendered board, the feel of the glide, the
`scrollIntoView` behaviour inside the board's own scroller, reduced-motion in
practice, and whether the copy reads well at step 4 of 5. Those need the owner's
click-through: a fresh account (empty board → the centred CTA is framed) and one
with tasks (the Todo `+` is framed), at 1280 / 1440 / 1600 / 1920, plus one pass
with the OS "reduce motion" setting on. The screenshot rig in `/tmp/mokara-shot`
is broken (its `puppeteer-core` has no `package.json` or entry point) and
repairing it means an unprompted install, so nothing here was visually checked.
